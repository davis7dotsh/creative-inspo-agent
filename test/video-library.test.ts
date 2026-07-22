import { readdirSync } from "node:fs"
import { basename } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { NotFoundError, StorageError, ValidationError } from "../src/domain/errors.js"
import type { PreparedChannel, PreparedVideo } from "../src/domain/video.js"
import { AppPaths } from "../src/services/app-paths.js"
import { makeVideoLibraryLive, VideoLibrary } from "../src/services/video-library.js"

const dimensions = 1536

const axisVector = (axis: number, magnitude = 1) => {
  const values = Array<number>(dimensions).fill(0)
  values[axis] = magnitude
  return values
}

interface VideoFixtureOptions {
  readonly id: string
  readonly title?: string
  readonly channelId?: string
  readonly channelTitle?: string
  readonly publishedAt?: string
  readonly durationSeconds?: number
  readonly viewCount?: string
  readonly titleVector?: ReadonlyArray<number>
  readonly thumbnailVector?: ReadonlyArray<number>
  readonly thumbnailContent?: string
}

const stageVideo = (root: string, options: VideoFixtureOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const localThumbnailPath = `${root}/staging/${options.id}.jpg`
    yield* fs.writeFileString(
      localThumbnailPath,
      options.thumbnailContent ?? `thumbnail:${options.id}`,
    )
    const titleVector = options.titleVector ?? axisVector(0)
    const thumbnailVector = options.thumbnailVector ?? axisVector(1)

    return {
      id: options.id,
      title: options.title ?? `Video ${options.id}`,
      channelId: options.channelId ?? "channel-1",
      channelTitle: options.channelTitle ?? "Channel One",
      publishedAt: options.publishedAt ?? "2026-01-01T00:00:00.000Z",
      durationSeconds: options.durationSeconds ?? 240,
      thumbnails: [
        {
          url: `https://example.com/${options.id}.jpg`,
          width: 1280,
          height: 720,
        },
      ],
      localThumbnailPath,
      statistics: {
        viewCount: options.viewCount ?? "1000",
        commentCount: "10",
      },
      thumbnailDescription: `Thumbnail for ${options.id}`,
      titleEmbedding: {
        model: "text-embedding-3-large",
        dimensions,
        values: [...titleVector],
      },
      thumbnailDescriptionEmbedding: {
        model: "text-embedding-3-large",
        dimensions,
        values: [...thumbnailVector],
      },
    } satisfies PreparedVideo
  })

const stageChannel = (
  root: string,
  options: {
    readonly id: string
    readonly title?: string
    readonly avatarContent?: string
  },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const localAvatarPath = `${root}/staging/${options.id}-avatar.jpg`
    yield* fs.writeFileString(localAvatarPath, options.avatarContent ?? `avatar:${options.id}`)
    return {
      id: options.id,
      title: options.title ?? `Channel ${options.id}`,
      avatars: [
        {
          url: `https://example.com/${options.id}-default.jpg`,
          width: 88,
          height: 88,
        },
        {
          url: `https://example.com/${options.id}-high.jpg`,
          width: 800,
          height: 800,
        },
      ],
      localAvatarPath,
    } satisfies PreparedChannel
  })

const runWithLibrary = <A, E>(
  useFileDatabase: boolean,
  program: (
    root: string,
    databaseFile: string,
  ) => Effect.Effect<A, E, FileSystem.FileSystem | VideoLibrary>,
  setup?: (root: string, databaseFile: string) => void,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-library-" })
      const databaseFile = useFileDatabase ? `${root}/creative-agent.sqlite` : ":memory:"
      yield* Effect.sync(() => setup?.(root, databaseFile))
      const appPathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
      const baseLayer = Layer.merge(NodeServices.layer, appPathsLayer)
      const libraryLayer = makeVideoLibraryLive({ databaseFilename: databaseFile }).pipe(
        Layer.provide(baseLayer),
      )
      const layer = Layer.merge(baseLayer, libraryLayer)
      return yield* program(root, databaseFile).pipe(Effect.provide(layer))
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

const installPostCommitCleanupFailure = (databaseFile: string) => {
  const database = new DatabaseSync(databaseFile)
  database.exec(`
    CREATE TRIGGER fail_post_commit_cleanup
    BEFORE UPDATE ON thumbnail_mutation_lock
    WHEN NEW.generation >= 3
    BEGIN
      SELECT RAISE(ABORT, 'forced post-commit cleanup failure');
    END
  `)
  database.close()
}

const readThumbnailMutationGeneration = (databaseFile: string) => {
  const database = new DatabaseSync(databaseFile)
  const row = database
    .prepare("SELECT generation FROM thumbnail_mutation_lock WHERE singleton = 1")
    .get()
  database.close()
  return Number(row?.generation)
}

describe("VideoLibrary", () => {
  it("atomically upserts batches and updates an existing video without duplication", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const original = yield* stageVideo(root, { id: "video-one", title: "Original title" })
        const first = yield* library.upsertPreparedBatch({ videos: [original] })
        const storedFirst = yield* library.show(original.id)

        const updated = yield* stageVideo(root, {
          id: original.id,
          title: "Updated title",
          viewCount: "2500",
          titleVector: axisVector(2),
        })
        const second = yield* library.upsertPreparedBatch({ videos: [updated] })
        const listed = yield* library.list()
        const storedSecond = yield* library.show(original.id)

        return { first, second, listed, storedFirst, storedSecond }
      }),
    )

    expect(result.first).toEqual({ total: 1, inserted: 1, updated: 0 })
    expect(result.second).toEqual({ total: 1, inserted: 0, updated: 1 })
    expect(result.listed).toHaveLength(1)
    expect(result.storedSecond.title).toBe("Updated title")
    expect(result.storedSecond.statistics.viewCount).toBe("2500")
    expect(result.storedSecond.createdAt).toBe(result.storedFirst.createdAt)
    expect(result.storedSecond.localThumbnailPath).toMatch(/assets\/thumbnails\/[a-f0-9]{64}\.jpg$/)
  })

  it("creates normalized channel identities for legacy video-only batches", async () => {
    const channel = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const video = yield* stageVideo(root, {
          id: "legacy-video",
          channelId: "legacy-channel",
          channelTitle: "Legacy Channel",
        })
        yield* library.upsertPreparedBatch({ videos: [video] })
        return yield* library.showChannel("legacy-channel")
      }),
    )

    expect(channel).toMatchObject({
      id: "legacy-channel",
      title: "Legacy Channel",
      avatars: [],
    })
    expect(channel.localAvatarPath).toBeUndefined()
  })

  it("migrates existing video channel identities with nullable avatars", async () => {
    const channel = await runWithLibrary(
      true,
      () =>
        Effect.gen(function* () {
          const library = yield* VideoLibrary
          return yield* library.showChannel("old-channel")
        }),
      (_root, databaseFile) => {
        const database = new DatabaseSync(databaseFile)
        database.exec(`
            CREATE TABLE effect_sql_migrations (
              migration_id INTEGER PRIMARY KEY NOT NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              name VARCHAR(255) NOT NULL
            );
            INSERT INTO effect_sql_migrations(migration_id, name)
            VALUES (1, 'initial'), (2, 'thumbnail_mutation_lock');
            CREATE TABLE thumbnail_mutation_lock (
              singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
              generation INTEGER NOT NULL
            ) STRICT;
            INSERT INTO thumbnail_mutation_lock(singleton, generation) VALUES (1, 0);
            CREATE TABLE videos (
              id TEXT PRIMARY KEY NOT NULL,
              title TEXT NOT NULL,
              channel_id TEXT NOT NULL,
              channel_title TEXT NOT NULL,
              published_at TEXT NOT NULL,
              duration_seconds INTEGER NOT NULL,
              thumbnail_urls_json TEXT NOT NULL,
              thumbnail_path TEXT NOT NULL,
              view_count INTEGER,
              comment_count INTEGER,
              thumbnail_description TEXT NOT NULL,
              embedding_model TEXT NOT NULL,
              embedding_dimensions INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            ) STRICT;
            INSERT INTO videos VALUES (
              'old-video',
              'Old video',
              'old-channel',
              'Old Channel',
              '2025-01-01T00:00:00.000Z',
              120,
              '[]',
              '/tmp/old-thumbnail.jpg',
              100,
              NULL,
              'Old thumbnail',
              'text-embedding-3-large',
              1536,
              '2025-01-01T00:00:00.000Z',
              '2025-02-01T00:00:00.000Z'
            );
        `)
        database.close()
      },
    )

    expect(channel).toEqual({
      id: "old-channel",
      title: "Old Channel",
      avatars: [],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-02-01T00:00:00.000Z",
    })
  })

  it("upserts channel avatars by channel id and cleans up superseded files", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const library = yield* VideoLibrary
        const original = yield* stageChannel(root, {
          id: "creator",
          title: "Original Creator",
          avatarContent: "original avatar",
        })
        const first = yield* library.upsertPreparedChannels({ channels: [original] })
        const originalStored = yield* library.showChannel(original.id)
        const updated = yield* stageChannel(root, {
          id: original.id,
          title: "Renamed Creator",
          avatarContent: "replacement avatar",
        })
        const second = yield* library.upsertPreparedChannels({ channels: [updated] })
        const updatedStored = yield* library.showChannel(updated.id)

        return {
          first,
          second,
          channels: yield* library.listChannels,
          originalPath: originalStored.localAvatarPath,
          updatedPath: updatedStored.localAvatarPath,
          originalExists:
            originalStored.localAvatarPath === undefined
              ? true
              : yield* fs.exists(originalStored.localAvatarPath),
          updatedExists:
            updatedStored.localAvatarPath === undefined
              ? false
              : yield* fs.exists(updatedStored.localAvatarPath),
        }
      }),
    )

    expect(result.first).toEqual({ total: 1, inserted: 1, updated: 0 })
    expect(result.second).toEqual({ total: 1, inserted: 0, updated: 1 })
    expect(result.channels).toHaveLength(1)
    expect(result.channels[0]?.title).toBe("Renamed Creator")
    expect(result.channels[0]?.avatars).toHaveLength(2)
    expect(result.updatedPath).toMatch(/assets\/channel-avatars\/[a-f0-9]{64}\.jpg$/)
    expect(result.updatedPath).not.toBe(result.originalPath)
    expect(result.originalExists).toBe(false)
    expect(result.updatedExists).toBe(true)
  })

  it("refreshes denormalized video and vector channel titles during enrichment", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const video = yield* stageVideo(root, {
          id: "renamed-video",
          channelId: "renamed-channel",
          channelTitle: "Old Name",
        })
        yield* library.upsertPreparedBatch({ videos: [video] })
        const channel = yield* stageChannel(root, {
          id: "renamed-channel",
          title: "Current Name",
        })
        yield* library.upsertPreparedChannels({ channels: [channel] })
        return {
          stored: yield* library.show(video.id),
          search: yield* library.searchSemantic({
            signal: "title",
            embedding: axisVector(0),
            model: "text-embedding-3-large",
            filters: { channel: "Current Name" },
          }),
        }
      }),
    )

    expect(result.stored.channelTitle).toBe("Current Name")
    expect(result.search.map(({ video }) => video.id)).toEqual(["renamed-video"])
  })

  it("prefers an enriched channel title throughout a mismatched combined batch", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const video = yield* stageVideo(root, {
          id: "combined-video",
          channelId: "combined-channel",
          channelTitle: "Stale Video Title",
        })
        const channel = yield* stageChannel(root, {
          id: "combined-channel",
          title: "Authoritative Channel Title",
        })
        yield* library.upsertPreparedBatch({ videos: [video], channels: [channel] })
        return {
          channel: yield* library.showChannel(channel.id),
          video: yield* library.show(video.id),
          search: yield* library.searchSemantic({
            signal: "title",
            embedding: axisVector(0),
            model: "text-embedding-3-large",
            filters: { channel: channel.title },
          }),
        }
      }),
    )

    expect(result.channel.title).toBe("Authoritative Channel Title")
    expect(result.video.channelTitle).toBe("Authoritative Channel Title")
    expect(result.search.map(({ video }) => video.id)).toEqual(["combined-video"])
  })

  it("applies a legacy channel rename to existing videos and vectors", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const original = yield* Effect.all([
          stageVideo(root, {
            id: "legacy-one",
            channelId: "legacy-rename",
            channelTitle: "Old Legacy Name",
          }),
          stageVideo(root, {
            id: "legacy-two",
            channelId: "legacy-rename",
            channelTitle: "Old Legacy Name",
          }),
        ])
        yield* library.upsertPreparedBatch({ videos: original })
        const renamed = yield* stageVideo(root, {
          id: "legacy-one",
          channelId: "legacy-rename",
          channelTitle: "Current Legacy Name",
        })
        yield* library.upsertPreparedBatch({ videos: [renamed] })
        return {
          channel: yield* library.showChannel("legacy-rename"),
          videos: yield* Effect.forEach(original, ({ id }) => library.show(id)),
          search: yield* library.searchSemantic({
            signal: "title",
            embedding: axisVector(0),
            model: "text-embedding-3-large",
            limit: 2,
            filters: { channel: "Current Legacy Name" },
          }),
        }
      }),
    )

    expect(result.channel.title).toBe("Current Legacy Name")
    expect(result.videos.map(({ channelTitle }) => channelTitle)).toEqual([
      "Current Legacy Name",
      "Current Legacy Name",
    ])
    expect(result.search.map(({ video }) => video.id).sort()).toEqual(["legacy-one", "legacy-two"])
  })

  it("rejects duplicate channel ids before storing an avatar", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const first = yield* stageChannel(root, { id: "duplicate" })
        const second = yield* stageChannel(root, { id: "duplicate", title: "Other" })
        const error = yield* library
          .upsertPreparedChannels({ channels: [first, second] })
          .pipe(Effect.flip)
        return { error, channels: yield* library.listChannels }
      }),
    )

    expect(result.error).toBeInstanceOf(ValidationError)
    expect(result.channels).toEqual([])
  })

  it("ranks title and thumbnail vectors with exact cosine distance and applies filters", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const videos = yield* Effect.all([
          stageVideo(root, {
            id: "same",
            channelId: "wanted",
            channelTitle: "Wanted",
            durationSeconds: 240,
            viewCount: "5000",
            titleVector: axisVector(0),
            thumbnailVector: axisVector(1),
          }),
          stageVideo(root, {
            id: "orthogonal",
            channelId: "wanted",
            channelTitle: "Wanted",
            durationSeconds: 300,
            viewCount: "500",
            titleVector: axisVector(1),
            thumbnailVector: axisVector(0),
          }),
          stageVideo(root, {
            id: "opposite",
            channelId: "other",
            channelTitle: "Other",
            titleVector: axisVector(0, -1),
            thumbnailVector: axisVector(2),
          }),
        ])
        yield* library.upsertPreparedBatch({ videos })

        const title = yield* library.searchSemantic({
          signal: "title",
          embedding: axisVector(0),
          model: "text-embedding-3-large",
          limit: 3,
        })
        const thumbnail = yield* library.searchSemantic({
          signal: "thumbnailDescription",
          embedding: axisVector(0),
          model: "text-embedding-3-large",
          limit: 3,
        })
        const filtered = yield* library.searchSemantic({
          signal: "title",
          embedding: axisVector(0),
          model: "text-embedding-3-large",
          filters: {
            channel: "wanted",
            maxDurationSeconds: 250,
            minViewCount: 1000,
          },
        })
        return { title, thumbnail, filtered }
      }),
    )

    expect(result.title.map(({ video }) => video.id)).toEqual(["same", "orthogonal", "opposite"])
    expect(result.title.map(({ distance }) => distance)).toEqual([0, 1, 2])
    expect(result.thumbnail[0]?.video.id).toBe("orthogonal")
    expect(result.filtered.map(({ video }) => video.id)).toEqual(["same"])
  })

  it("supports simple keyword title search with metadata filters", async () => {
    const results = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const videos = yield* Effect.all([
          stageVideo(root, {
            id: "ranking",
            title: "I Ranked Every Camera",
            channelId: "studio-channel",
            channelTitle: "Studio",
            publishedAt: "2026-05-01T00:00:00.000Z",
            viewCount: "9000",
          }),
          stageVideo(root, {
            id: "guide",
            title: "Camera Setup Guide",
            channelId: "other-channel",
            channelTitle: "Other",
            publishedAt: "2024-05-01T00:00:00.000Z",
            viewCount: "500",
          }),
        ])
        yield* library.upsertPreparedBatch({ videos })
        return yield* library.searchKeyword({
          query: "camera",
          filters: {
            channel: "Studio",
            publishedAfter: "2025-01-01T00:00:00.000Z",
            minViewCount: 1000,
          },
        })
      }),
    )

    expect(results.map(({ video }) => video.id)).toEqual(["ranking"])
    expect(results[0]?.matchedSignal).toBe("keyword")
  })

  it("rolls back database writes and newly promoted assets when a video batch fails", async () => {
    const result = await runWithLibrary(true, (root, databaseFile) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const preserved = yield* stageVideo(root, { id: "preserved" })
        yield* library.upsertPreparedBatch({ videos: [preserved] })
        const storedPreserved = yield* library.show(preserved.id)

        yield* Effect.sync(() => {
          const database = new DatabaseSync(databaseFile)
          database.exec(`
            CREATE TRIGGER force_batch_failure
            BEFORE INSERT ON videos
            WHEN NEW.id = 'fail'
            BEGIN
              SELECT RAISE(ABORT, 'forced batch failure');
            END
          `)
          database.close()
        })
        const videos = yield* Effect.all([
          stageVideo(root, { id: "preserved", title: "Rolled-back update" }),
          stageVideo(root, { id: "would-have-succeeded" }),
          stageVideo(root, { id: "fail" }),
        ])
        const channel = yield* stageChannel(root, { id: "batch-channel" })
        const error = yield* library
          .upsertPreparedBatch({ videos, channels: [channel] })
          .pipe(Effect.flip)
        expect(error).toBeInstanceOf(StorageError)
        const stored = yield* library.list()
        return {
          stored,
          channels: yield* library.listChannels,
          thumbnails: readdirSync(`${root}/assets/thumbnails`),
          avatars: readdirSync(`${root}/assets/channel-avatars`),
          preservedThumbnail: basename(storedPreserved.localThumbnailPath),
        }
      }),
    )

    expect(result.stored.map(({ id }) => id)).toEqual(["preserved"])
    expect(result.stored[0]?.title).toBe("Video preserved")
    expect(result.channels.map(({ id }) => id)).toEqual(["channel-1"])
    expect(result.thumbnails).toEqual([result.preservedThumbnail])
    expect(result.avatars).toEqual([])
  })

  it("reports truthful success when post-commit asset cleanup fails", async () => {
    const videoResult = await runWithLibrary(true, (root, databaseFile) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const library = yield* VideoLibrary
        yield* Effect.sync(() => installPostCommitCleanupFailure(databaseFile))
        const video = yield* stageVideo(root, { id: "committed-video" })
        const result = yield* library.upsertPreparedBatch({ videos: [video] })
        const stored = yield* library.show(video.id)
        return {
          result,
          generation: yield* Effect.sync(() => readThumbnailMutationGeneration(databaseFile)),
          assetExists: yield* fs.exists(stored.localThumbnailPath),
        }
      }),
    )
    const channelResult = await runWithLibrary(true, (root, databaseFile) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const library = yield* VideoLibrary
        yield* Effect.sync(() => installPostCommitCleanupFailure(databaseFile))
        const channel = yield* stageChannel(root, { id: "committed-channel" })
        const result = yield* library.upsertPreparedChannels({ channels: [channel] })
        const stored = yield* library.showChannel(channel.id)
        return {
          result,
          generation: yield* Effect.sync(() => readThumbnailMutationGeneration(databaseFile)),
          assetExists:
            stored.localAvatarPath === undefined ? false : yield* fs.exists(stored.localAvatarPath),
        }
      }),
    )

    expect(videoResult).toEqual({
      result: { total: 1, inserted: 1, updated: 0 },
      generation: 2,
      assetExists: true,
    })
    expect(channelResult).toEqual({
      result: { total: 1, inserted: 1, updated: 0 },
      generation: 2,
      assetExists: true,
    })
  })

  it("removes superseded thumbnails after a committed update", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const library = yield* VideoLibrary
        const original = yield* stageVideo(root, {
          id: "updated-thumbnail",
          thumbnailContent: "original thumbnail",
        })
        yield* library.upsertPreparedBatch({ videos: [original] })
        const originalPath = (yield* library.show(original.id)).localThumbnailPath

        const updated = yield* stageVideo(root, {
          id: original.id,
          thumbnailContent: "replacement thumbnail",
        })
        yield* library.upsertPreparedBatch({ videos: [updated] })
        const updatedPath = (yield* library.show(updated.id)).localThumbnailPath

        return {
          originalPath,
          updatedPath,
          originalExists: yield* fs.exists(originalPath),
          updatedExists: yield* fs.exists(updatedPath),
        }
      }),
    )

    expect(result.updatedPath).not.toBe(result.originalPath)
    expect(result.originalExists).toBe(false)
    expect(result.updatedExists).toBe(true)
  })

  it("atomically validates batch deletion and preserves shared thumbnails", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const library = yield* VideoLibrary
        const first = yield* stageVideo(root, { id: "first", thumbnailContent: "shared" })
        const second = yield* stageVideo(root, { id: "second", thumbnailContent: "shared" })
        yield* library.upsertPreparedBatch({ videos: [first, second] })
        const thumbnailPath = (yield* library.show(first.id)).localThumbnailPath

        const error = yield* library.deleteMany([first.id, "missing"]).pipe(Effect.flip)
        const afterFailure = yield* library.list()
        yield* library.deleteMany([first.id])
        const sharedAfterFirstDelete = yield* fs.exists(thumbnailPath)
        yield* library.deleteMany([second.id])
        const sharedAfterLastDelete = yield* fs.exists(thumbnailPath)

        return { error, afterFailure, sharedAfterFirstDelete, sharedAfterLastDelete }
      }),
    )

    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.afterFailure.map(({ id }) => id).sort()).toEqual(["first", "second"])
    expect(result.sharedAfterFirstDelete).toBe(true)
    expect(result.sharedAfterLastDelete).toBe(false)
  })

  it("rejects invalid vectors before persistence", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const video = yield* stageVideo(root, { id: "invalid" })
        const invalid = {
          ...video,
          titleEmbedding: {
            ...video.titleEmbedding,
            values: video.titleEmbedding.values.slice(1),
          },
        }
        const error = yield* library.upsertPreparedBatch({ videos: [invalid] }).pipe(Effect.flip)
        return { error, count: (yield* library.list()).length }
      }),
    )

    expect(result.error).toBeInstanceOf(ValidationError)
    expect(result.count).toBe(0)
  })

  it("rejects an under-180-second batch before promoting thumbnail assets", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const eligible = yield* stageVideo(root, { id: "eligible", durationSeconds: 180 })
        const short = yield* stageVideo(root, { id: "short", durationSeconds: 179 })
        const error = yield* library
          .upsertPreparedBatch({ videos: [eligible, short] })
          .pipe(Effect.flip)

        return {
          error,
          stored: yield* library.list(),
          thumbnails: readdirSync(`${root}/assets/thumbnails`),
        }
      }),
    )

    expect(result.error).toBeInstanceOf(ValidationError)
    expect(result.error).toMatchObject({
      message: "video short is under the 180-second minimum duration",
    })
    expect(result.stored).toEqual([])
    expect(result.thumbnails).toEqual([])
  })

  it("deletes videos and can atomically replace embeddings for reindexing", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const first = yield* stageVideo(root, { id: "first", titleVector: axisVector(0) })
        const second = yield* stageVideo(root, { id: "second", titleVector: axisVector(1) })
        yield* library.upsertPreparedBatch({ videos: [first, second] })
        yield* library.replaceEmbeddings({
          videos: [
            {
              id: "first",
              titleEmbedding: {
                model: "text-embedding-3-large",
                dimensions,
                values: axisVector(2),
              },
              thumbnailDescriptionEmbedding: {
                model: "text-embedding-3-large",
                dimensions,
                values: axisVector(2),
              },
            },
          ],
        })
        const reindexed = yield* library.searchSemantic({
          signal: "title",
          embedding: axisVector(2),
          model: "text-embedding-3-large",
          limit: 2,
        })
        yield* library.delete("first")
        return { reindexed, remaining: yield* library.list() }
      }),
    )

    expect(result.reindexed[0]?.video.id).toBe("first")
    expect(result.reindexed[0]?.distance).toBe(0)
    expect(result.remaining.map(({ id }) => id)).toEqual(["second"])
  })

  it("maps database constructor defects to a typed storage error", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-library-" })
        const appPathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
        const baseLayer = Layer.merge(NodeServices.layer, appPathsLayer)
        const libraryLayer = makeVideoLibraryLive({ databaseFilename: root }).pipe(
          Layer.provide(baseLayer),
        )
        const layer = Layer.merge(baseLayer, libraryLayer)
        return yield* VideoLibrary.pipe(Effect.provide(layer), Effect.flip)
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )

    expect(error).toBeInstanceOf(StorageError)
    expect(error).toMatchObject({ operation: "open video library database" })
  })
})

import { readdirSync } from "node:fs"
import { basename } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { NotFoundError, StorageError, ValidationError } from "../src/domain/errors.js"
import type { PreparedVideo } from "../src/domain/video.js"
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
      durationSeconds: options.durationSeconds ?? 120,
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

const runWithLibrary = <A, E>(
  useFileDatabase: boolean,
  program: (
    root: string,
    databaseFile: string,
  ) => Effect.Effect<A, E, FileSystem.FileSystem | VideoLibrary>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-library-" })
      const databaseFile = useFileDatabase ? `${root}/creative-agent.sqlite` : ":memory:"
      const appPathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
      const baseLayer = Layer.merge(NodeServices.layer, appPathsLayer)
      const libraryLayer = makeVideoLibraryLive({ databaseFilename: databaseFile }).pipe(
        Layer.provide(baseLayer),
      )
      const layer = Layer.merge(baseLayer, libraryLayer)
      return yield* program(root, databaseFile).pipe(Effect.provide(layer))
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

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

  it("ranks title and thumbnail vectors with exact cosine distance and applies filters", async () => {
    const result = await runWithLibrary(false, (root) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        const videos = yield* Effect.all([
          stageVideo(root, {
            id: "same",
            channelId: "wanted",
            channelTitle: "Wanted",
            durationSeconds: 90,
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
            maxDurationSeconds: 100,
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
            channelTitle: "Studio",
            publishedAt: "2026-05-01T00:00:00.000Z",
            viewCount: "9000",
          }),
          stageVideo(root, {
            id: "guide",
            title: "Camera Setup Guide",
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

  it("rolls back database writes and only newly promoted thumbnails when a batch fails", async () => {
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
        const error = yield* library.upsertPreparedBatch({ videos }).pipe(Effect.flip)
        expect(error).toBeInstanceOf(StorageError)
        const stored = yield* library.list()
        return {
          stored,
          thumbnails: readdirSync(`${root}/assets/thumbnails`),
          preservedThumbnail: basename(storedPreserved.localThumbnailPath),
        }
      }),
    )

    expect(result.stored.map(({ id }) => id)).toEqual(["preserved"])
    expect(result.stored[0]?.title).toBe("Video preserved")
    expect(result.thumbnails).toEqual([result.preservedThumbnail])
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

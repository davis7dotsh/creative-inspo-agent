import { createHash } from "node:crypto"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Cause, Context, Effect, FileSystem, Layer, Path, Schema } from "effect"
import { Reactivity } from "effect/unstable/reactivity"
import { SqlClient, type Statement } from "effect/unstable/sql"
import { NotFoundError, StorageError, ValidationError } from "../domain/errors.js"
import {
  ChannelAvatarVariant,
  type ChannelAvatarVariant as ChannelAvatarVariantValue,
  type Embedding,
  type PreparedChannel,
  type PreparedChannelBatch,
  type PreparedVideo,
  type PreparedVideoBatch,
  ThumbnailVariant,
  type ThumbnailVariant as ThumbnailVariantValue,
  type VideoEmbeddingUpdateBatch,
} from "../domain/video.js"
import { initializeAppPaths } from "./app-paths.js"
import { videoLibraryMigrations } from "./video-library-migrations.js"
import { getLoadablePath } from "sqlite-vec"

const embeddingDimensions = 1536

export interface StoredVideo {
  readonly id: string
  readonly title: string
  readonly channelId: string
  readonly channelTitle: string
  readonly publishedAt: string
  readonly durationSeconds: number
  readonly thumbnails: ReadonlyArray<ThumbnailVariantValue>
  readonly localThumbnailPath: string
  readonly statistics: {
    readonly viewCount: string
    readonly commentCount?: string
  }
  readonly thumbnailDescription: string
  readonly embeddingModel: string
  readonly embeddingDimensions: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface StoredChannel {
  readonly id: string
  readonly title: string
  readonly avatars: ReadonlyArray<ChannelAvatarVariantValue>
  readonly localAvatarPath?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface VideoFilters {
  readonly channel?: string
  readonly publishedAfter?: string
  readonly publishedBefore?: string
  readonly minDurationSeconds?: number
  readonly maxDurationSeconds?: number
  readonly minViewCount?: number
  readonly maxViewCount?: number
}

export interface SemanticSearchRequest {
  readonly signal: "title" | "thumbnailDescription"
  readonly embedding: ReadonlyArray<number>
  readonly model: string
  readonly limit?: number
  readonly filters?: VideoFilters
}

export interface KeywordSearchRequest {
  readonly query: string
  readonly limit?: number
  readonly filters?: VideoFilters
}

export interface SemanticSearchResult {
  readonly video: StoredVideo
  readonly matchedSignal: "title" | "thumbnailDescription"
  readonly distance: number
  readonly similarity: number
}

export interface KeywordSearchResult {
  readonly video: StoredVideo
  readonly matchedSignal: "keyword"
}

export interface UpsertResult {
  readonly total: number
  readonly inserted: number
  readonly updated: number
}

export interface ChannelUpsertResult {
  readonly total: number
  readonly inserted: number
  readonly updated: number
}

export interface ListVideosOptions {
  readonly limit?: number
  readonly offset?: number
}

export interface VideoLibraryShape {
  readonly upsertPreparedBatch: (
    batch: PreparedVideoBatch,
  ) => Effect.Effect<UpsertResult, StorageError | ValidationError>
  readonly searchSemantic: (
    request: SemanticSearchRequest,
  ) => Effect.Effect<ReadonlyArray<SemanticSearchResult>, StorageError | ValidationError>
  readonly searchKeyword: (
    request: KeywordSearchRequest,
  ) => Effect.Effect<ReadonlyArray<KeywordSearchResult>, StorageError | ValidationError>
  readonly list: (
    options?: ListVideosOptions,
  ) => Effect.Effect<ReadonlyArray<StoredVideo>, StorageError | ValidationError>
  readonly show: (id: string) => Effect.Effect<StoredVideo, NotFoundError | StorageError>
  readonly delete: (
    id: string,
  ) => Effect.Effect<void, NotFoundError | StorageError | ValidationError>
  readonly deleteMany: (
    ids: ReadonlyArray<string>,
  ) => Effect.Effect<void, NotFoundError | StorageError | ValidationError>
  readonly replaceEmbeddings: (
    batch: VideoEmbeddingUpdateBatch,
  ) => Effect.Effect<void, NotFoundError | StorageError | ValidationError>
  readonly upsertPreparedChannels: (
    batch: PreparedChannelBatch,
  ) => Effect.Effect<ChannelUpsertResult, StorageError | ValidationError>
  readonly listChannels: Effect.Effect<ReadonlyArray<StoredChannel>, StorageError>
  readonly showChannel: (id: string) => Effect.Effect<StoredChannel, NotFoundError | StorageError>
}

export class VideoLibrary extends Context.Service<VideoLibrary, VideoLibraryShape>()(
  "creative-agent/VideoLibrary",
) {}

interface StoredVideoRow {
  readonly id: string
  readonly title: string
  readonly channel_id: string
  readonly channel_title: string
  readonly published_at: string
  readonly duration_seconds: number
  readonly thumbnail_urls_json: string
  readonly thumbnail_path: string
  readonly view_count: number | null
  readonly comment_count: number | null
  readonly thumbnail_description: string
  readonly embedding_model: string
  readonly embedding_dimensions: number
  readonly created_at: string
  readonly updated_at: string
}

interface SemanticSearchRow extends StoredVideoRow {
  readonly distance: number
}

interface StoredChannelRow {
  readonly id: string
  readonly title: string
  readonly avatar_urls_json: string | null
  readonly avatar_path: string | null
  readonly created_at: string
  readonly updated_at: string
}

interface PreparedForStorage {
  readonly video: PreparedVideo
  readonly thumbnailPath: string
  readonly thumbnailBytes: Uint8Array
  readonly viewCount: number
  readonly commentCount: number | null
  readonly publishedEpoch: number
  readonly titleEmbedding: Uint8Array
  readonly thumbnailEmbedding: Uint8Array
}

interface PreparedChannelForStorage {
  readonly channel: PreparedChannel
  readonly avatarPath: string
  readonly avatarBytes: Uint8Array
}

interface VideoLibraryLayerOptions {
  readonly databaseFilename?: string
}

const validationFailure = (message: string) =>
  Effect.fail(
    new ValidationError({
      message,
    }),
  )

const storageFailure = (operation: string, cause: unknown) =>
  new StorageError({
    operation,
    message: String(cause),
  })

const validateNonNegativeInteger = (value: number, label: string) =>
  Number.isSafeInteger(value) && value >= 0
    ? Effect.succeed(value)
    : validationFailure(`${label} must be a non-negative safe integer`)

const parseCount = (value: string, label: string) => {
  const parsed = Number(value)
  return validateNonNegativeInteger(parsed, label)
}

const validateEmbedding = (embedding: Embedding, label: string) =>
  Effect.gen(function* () {
    if (embedding.model.trim().length === 0) {
      return yield* validationFailure(`${label} model cannot be empty`)
    }
    if (embedding.dimensions !== embeddingDimensions) {
      return yield* validationFailure(
        `${label} must have exactly ${embeddingDimensions} dimensions`,
      )
    }
    if (embedding.values.length !== embeddingDimensions) {
      return yield* validationFailure(
        `${label} has ${embedding.values.length} values; expected ${embeddingDimensions}`,
      )
    }
    if (!embedding.values.every(Number.isFinite)) {
      return yield* validationFailure(`${label} contains a non-finite value`)
    }

    const floats = Float32Array.from(embedding.values)
    if (!floats.every(Number.isFinite)) {
      return yield* validationFailure(`${label} contains a value outside float32 range`)
    }

    return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength)
  })

const validateFilters = (filters: VideoFilters | undefined) =>
  Effect.gen(function* () {
    if (filters === undefined) {
      return
    }

    for (const [value, label] of [
      [filters.minDurationSeconds, "minDurationSeconds"],
      [filters.maxDurationSeconds, "maxDurationSeconds"],
      [filters.minViewCount, "minViewCount"],
      [filters.maxViewCount, "maxViewCount"],
    ] as const) {
      if (value !== undefined) {
        yield* validateNonNegativeInteger(value, label)
      }
    }

    if (
      filters.minDurationSeconds !== undefined &&
      filters.maxDurationSeconds !== undefined &&
      filters.minDurationSeconds > filters.maxDurationSeconds
    ) {
      return yield* validationFailure("minDurationSeconds cannot exceed maxDurationSeconds")
    }
    if (
      filters.minViewCount !== undefined &&
      filters.maxViewCount !== undefined &&
      filters.minViewCount > filters.maxViewCount
    ) {
      return yield* validationFailure("minViewCount cannot exceed maxViewCount")
    }

    for (const [value, label] of [
      [filters.publishedAfter, "publishedAfter"],
      [filters.publishedBefore, "publishedBefore"],
    ] as const) {
      if (value !== undefined && !Number.isFinite(Date.parse(value))) {
        return yield* validationFailure(`${label} must be a valid timestamp`)
      }
    }
  })

const validateLimit = (limit: number | undefined, fallback: number) => {
  const value = limit ?? fallback
  return Number.isSafeInteger(value) && value > 0 && value <= 200
    ? Effect.succeed(value)
    : validationFailure("limit must be an integer between 1 and 200")
}

const decodeStoredVideo = (row: StoredVideoRow) =>
  Effect.gen(function* () {
    const thumbnails = yield* Effect.try({
      try: () => JSON.parse(row.thumbnail_urls_json),
      catch: (cause) => storageFailure("decode thumbnail metadata", cause),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(ThumbnailVariant))),
      Effect.mapError((cause) => storageFailure("decode thumbnail metadata", cause)),
    )

    const statistics =
      row.comment_count === null
        ? { viewCount: String(row.view_count ?? 0) }
        : {
            viewCount: String(row.view_count ?? 0),
            commentCount: String(row.comment_count),
          }

    return {
      id: row.id,
      title: row.title,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      publishedAt: row.published_at,
      durationSeconds: row.duration_seconds,
      thumbnails,
      localThumbnailPath: row.thumbnail_path,
      statistics,
      thumbnailDescription: row.thumbnail_description,
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies StoredVideo
  })

const decodeStoredChannel = (row: StoredChannelRow) =>
  Effect.gen(function* () {
    const avatarUrlsJson = row.avatar_urls_json
    const avatars =
      avatarUrlsJson === null
        ? []
        : yield* Effect.try({
            try: () => JSON.parse(avatarUrlsJson),
            catch: (cause) => storageFailure("decode channel avatar metadata", cause),
          }).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(ChannelAvatarVariant))),
            Effect.mapError((cause) => storageFailure("decode channel avatar metadata", cause)),
          )

    return {
      id: row.id,
      title: row.title,
      avatars,
      ...(row.avatar_path === null ? {} : { localAvatarPath: row.avatar_path }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies StoredChannel
  })

const makeVectorFilterClauses = (sql: SqlClient.SqlClient, filters: VideoFilters | undefined) => {
  const clauses: Array<Statement.Fragment> = []
  if (filters?.channel !== undefined) {
    clauses.push(sql`(channel_id = ${filters.channel} OR channel_title = ${filters.channel})`)
  }
  if (filters?.publishedAfter !== undefined) {
    clauses.push(sql`published_epoch >= ${Date.parse(filters.publishedAfter)}`)
  }
  if (filters?.publishedBefore !== undefined) {
    clauses.push(sql`published_epoch <= ${Date.parse(filters.publishedBefore)}`)
  }
  if (filters?.minDurationSeconds !== undefined) {
    clauses.push(sql`duration_seconds >= ${filters.minDurationSeconds}`)
  }
  if (filters?.maxDurationSeconds !== undefined) {
    clauses.push(sql`duration_seconds <= ${filters.maxDurationSeconds}`)
  }
  if (filters?.minViewCount !== undefined) {
    clauses.push(sql`view_count >= ${filters.minViewCount}`)
  }
  if (filters?.maxViewCount !== undefined) {
    clauses.push(sql`view_count >= 0`, sql`view_count <= ${filters.maxViewCount}`)
  }
  return clauses
}

const makeRelationalFilterClauses = (
  sql: SqlClient.SqlClient,
  filters: VideoFilters | undefined,
) => {
  const clauses: Array<Statement.Fragment> = []
  if (filters?.channel !== undefined) {
    clauses.push(sql`(v.channel_id = ${filters.channel} OR v.channel_title = ${filters.channel})`)
  }
  if (filters?.publishedAfter !== undefined) {
    clauses.push(sql`v.published_at >= ${new Date(filters.publishedAfter).toISOString()}`)
  }
  if (filters?.publishedBefore !== undefined) {
    clauses.push(sql`v.published_at <= ${new Date(filters.publishedBefore).toISOString()}`)
  }
  if (filters?.minDurationSeconds !== undefined) {
    clauses.push(sql`v.duration_seconds >= ${filters.minDurationSeconds}`)
  }
  if (filters?.maxDurationSeconds !== undefined) {
    clauses.push(sql`v.duration_seconds <= ${filters.maxDurationSeconds}`)
  }
  if (filters?.minViewCount !== undefined) {
    clauses.push(sql`v.view_count >= ${filters.minViewCount}`)
  }
  if (filters?.maxViewCount !== undefined) {
    clauses.push(sql`v.view_count IS NOT NULL`, sql`v.view_count <= ${filters.maxViewCount}`)
  }
  return clauses
}

const makeVideoLibrary = (options: VideoLibraryLayerOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const paths = yield* initializeAppPaths
    const sql = yield* SqliteClient.make({
      filename: options.databaseFilename ?? paths.databaseFile,
    }).pipe(
      Effect.catchCauseIf(Cause.hasDies, (cause) =>
        Effect.fail(storageFailure("open video library database", Cause.squash(cause))),
      ),
    )
    const extensionPath = yield* Effect.try({
      try: getLoadablePath,
      catch: (cause) => storageFailure("locate sqlite-vec extension", cause),
    })

    yield* sql
      .loadExtension(extensionPath)
      .pipe(Effect.mapError((cause) => storageFailure("load sqlite-vec extension", cause)))
    yield* SqliteMigrator.run({ loader: videoLibraryMigrations }).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
      Effect.mapError((cause) => storageFailure("migrate video library", cause)),
    )

    const withThumbnailMutationLock = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`
            UPDATE thumbnail_mutation_lock
            SET generation = generation + 1
            WHERE singleton = 1
          `
          return yield* effect
        }),
      )

    const sweepUnreferencedAssets = withThumbnailMutationLock(
      Effect.gen(function* () {
        const referencedThumbnailRows = yield* sql<{ readonly thumbnail_path: string }>`
          SELECT DISTINCT thumbnail_path FROM videos
        `
        const referencedAvatarRows = yield* sql<{ readonly avatar_path: string }>`
          SELECT DISTINCT avatar_path FROM channels WHERE avatar_path IS NOT NULL
        `
        const directories = [
          {
            directory: paths.thumbnailsDirectory,
            referenced: new Set(referencedThumbnailRows.map((row) => row.thumbnail_path)),
          },
          {
            directory: paths.channelAvatarsDirectory,
            referenced: new Set(referencedAvatarRows.map((row) => row.avatar_path)),
          },
        ]
        yield* Effect.forEach(directories, ({ directory, referenced }) =>
          Effect.gen(function* () {
            const entries = yield* fs.readDirectory(directory)
            yield* Effect.forEach(
              entries,
              (entry) => {
                const assetPath = path.join(directory, entry)
                return referenced.has(assetPath)
                  ? Effect.void
                  : fs.remove(assetPath, { force: true })
              },
              { discard: true },
            )
          }),
        )
      }),
    ).pipe(Effect.mapError((cause) => storageFailure("clean up retained assets", cause)))

    const sweepUnreferencedAssetsBestEffort = sweepUnreferencedAssets.pipe(Effect.ignore)

    yield* sweepUnreferencedAssets

    const prepareAsset = (sourcePath: string, label: string, destinationDirectory: string) =>
      Effect.gen(function* () {
        const stagingRoot = yield* fs.realPath(paths.stagingDirectory)
        const source = yield* fs.realPath(sourcePath)
        const relative = path.relative(stagingRoot, source)
        if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
          return yield* validationFailure(
            `${label} must be a file inside ${paths.stagingDirectory}`,
          )
        }
        const info = yield* fs.stat(source)
        if (info.type !== "File") {
          return yield* validationFailure(`${label} is not a regular file`)
        }

        const bytes = yield* fs.readFile(source)
        const hash = createHash("sha256").update(bytes).digest("hex")
        const candidateExtension = path.extname(source).toLowerCase()
        const extension = /^\.[a-z0-9]{1,5}$/.test(candidateExtension) ? candidateExtension : ".img"
        const destination = path.join(destinationDirectory, `${hash}${extension}`)
        return { path: destination, bytes }
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof ValidationError ? cause : storageFailure(`prepare ${label}`, cause),
        ),
      )

    const prepareThumbnail = (video: PreparedVideo) =>
      prepareAsset(video.localThumbnailPath, `thumbnail for ${video.id}`, paths.thumbnailsDirectory)

    const prepareChannel = (channel: PreparedChannel) =>
      Effect.gen(function* () {
        for (const [value, label] of [
          [channel.id, "channel id"],
          [channel.title, "channel title"],
        ] as const) {
          if (value.trim().length === 0) {
            return yield* validationFailure(`${label} cannot be empty`)
          }
        }
        if (channel.avatars.length === 0) {
          return yield* validationFailure(`channel ${channel.id} must include avatar metadata`)
        }
        for (const avatar of channel.avatars) {
          if (avatar.url.trim().length === 0) {
            return yield* validationFailure(`channel ${channel.id} has an empty avatar URL`)
          }
        }
        const avatar = yield* prepareAsset(
          channel.localAvatarPath,
          `avatar for channel ${channel.id}`,
          paths.channelAvatarsDirectory,
        )
        return {
          channel,
          avatarPath: avatar.path,
          avatarBytes: avatar.bytes,
        } satisfies PreparedChannelForStorage
      })

    const prepareVideo = (video: PreparedVideo) =>
      Effect.gen(function* () {
        for (const [value, label] of [
          [video.id, "video id"],
          [video.title, "title"],
          [video.channelId, "channel id"],
          [video.channelTitle, "channel title"],
          [video.thumbnailDescription, "thumbnail description"],
        ] as const) {
          if (value.trim().length === 0) {
            return yield* validationFailure(`${label} cannot be empty`)
          }
        }
        yield* validateNonNegativeInteger(video.durationSeconds, "durationSeconds")
        const publishedEpoch = Date.parse(video.publishedAt)
        if (!Number.isFinite(publishedEpoch)) {
          return yield* validationFailure(`publishedAt for ${video.id} is invalid`)
        }
        if (video.thumbnails.length === 0) {
          return yield* validationFailure(`video ${video.id} must include thumbnail metadata`)
        }

        const titleEmbedding = yield* validateEmbedding(
          video.titleEmbedding,
          `title embedding for ${video.id}`,
        )
        const thumbnailEmbedding = yield* validateEmbedding(
          video.thumbnailDescriptionEmbedding,
          `thumbnail embedding for ${video.id}`,
        )
        if (video.titleEmbedding.model !== video.thumbnailDescriptionEmbedding.model) {
          return yield* validationFailure(`embeddings for ${video.id} must use the same model`)
        }

        const viewCount = yield* parseCount(video.statistics.viewCount, "viewCount")
        const commentCount =
          video.statistics.commentCount === undefined
            ? null
            : yield* parseCount(video.statistics.commentCount, "commentCount")
        const thumbnail = yield* prepareThumbnail(video)

        return {
          video,
          thumbnailPath: thumbnail.path,
          thumbnailBytes: thumbnail.bytes,
          viewCount,
          commentCount,
          publishedEpoch,
          titleEmbedding,
          thumbnailEmbedding,
        } satisfies PreparedForStorage
      })

    const insertVector = (prepared: PreparedForStorage, channelTitle: string) =>
      sql`
        INSERT INTO video_vectors(
          video_id,
          title_embedding,
          thumbnail_embedding,
          channel_id,
          channel_title,
          published_epoch,
          duration_seconds,
          view_count,
          embedding_model
        ) VALUES (
          ${prepared.video.id},
          ${prepared.titleEmbedding},
          ${prepared.thumbnailEmbedding},
          ${prepared.video.channelId},
          ${channelTitle},
          ${prepared.publishedEpoch},
          ${prepared.video.durationSeconds},
          ${prepared.viewCount},
          ${prepared.video.titleEmbedding.model}
        )
      `

    const prepareChannelBatch = (channels: ReadonlyArray<PreparedChannel>) =>
      Effect.gen(function* () {
        const ids = channels.map((channel) => channel.id)
        if (new Set(ids).size !== ids.length) {
          return yield* validationFailure("a prepared channel batch cannot contain duplicate ids")
        }
        return yield* Effect.forEach(channels, prepareChannel)
      })

    const synchronizeChannelTitle = (id: string, title: string) =>
      Effect.gen(function* () {
        yield* sql`
          UPDATE videos
          SET channel_title = ${title}
          WHERE channel_id = ${id}
        `
        yield* sql`
          UPDATE video_vectors
          SET channel_title = ${title}
          WHERE channel_id = ${id}
        `
      })

    const persistPreparedChannels = (
      preparedChannels: ReadonlyArray<PreparedChannelForStorage>,
      now: string,
    ) =>
      Effect.gen(function* () {
        let inserted = 0
        let updated = 0

        for (const item of preparedChannels) {
          const existing = yield* sql<{ readonly id: string }>`
            SELECT id FROM channels WHERE id = ${item.channel.id}
          `
          if (existing.length === 0) {
            inserted += 1
          } else {
            updated += 1
          }

          yield* sql`
            INSERT INTO channels(
              id,
              title,
              avatar_urls_json,
              avatar_path,
              created_at,
              updated_at
            ) VALUES (
              ${item.channel.id},
              ${item.channel.title},
              ${JSON.stringify(item.channel.avatars)},
              ${item.avatarPath},
              ${now},
              ${now}
            )
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              avatar_urls_json = excluded.avatar_urls_json,
              avatar_path = excluded.avatar_path,
              updated_at = excluded.updated_at
          `
          yield* synchronizeChannelTitle(item.channel.id, item.channel.title)
          if (!(yield* fs.exists(item.avatarPath))) {
            yield* fs.writeFile(item.avatarPath, item.avatarBytes)
          }
        }

        return { total: preparedChannels.length, inserted, updated }
      })

    const upsertPreparedChannels = Effect.fn("VideoLibrary.upsertPreparedChannels")(function* (
      batch: PreparedChannelBatch,
    ) {
      const preparedChannels = yield* prepareChannelBatch(batch.channels)
      if (preparedChannels.length === 0) {
        return { total: 0, inserted: 0, updated: 0 }
      }
      const result = yield* withThumbnailMutationLock(
        persistPreparedChannels(preparedChannels, new Date().toISOString()),
      ).pipe(
        Effect.mapError((cause) => storageFailure("upsert prepared channels", cause)),
        Effect.onError(() => sweepUnreferencedAssetsBestEffort),
      )
      yield* sweepUnreferencedAssetsBestEffort
      return result
    })

    const upsertPreparedBatch = Effect.fn("VideoLibrary.upsertPreparedBatch")(function* (
      batch: PreparedVideoBatch,
    ) {
      const ids = batch.videos.map((video) => video.id)
      if (new Set(ids).size !== ids.length) {
        return yield* validationFailure("a prepared batch cannot contain duplicate video ids")
      }

      const prepared = yield* Effect.forEach(batch.videos, prepareVideo)
      const preparedChannels = yield* prepareChannelBatch(batch.channels ?? [])
      if (prepared.length === 0 && preparedChannels.length === 0) {
        return { total: 0, inserted: 0, updated: 0 }
      }

      const authoritativeChannelTitles = new Map(
        prepared.map(({ video }) => [video.channelId, video.channelTitle] as const),
      )
      for (const { channel } of preparedChannels) {
        authoritativeChannelTitles.set(channel.id, channel.title)
      }

      const persist = withThumbnailMutationLock(
        Effect.gen(function* () {
          let inserted = 0
          let updated = 0
          const now = new Date().toISOString()

          yield* persistPreparedChannels(preparedChannels, now)

          const enrichedChannelIds = new Set(preparedChannels.map(({ channel }) => channel.id))
          for (const [id, title] of authoritativeChannelTitles) {
            if (enrichedChannelIds.has(id)) {
              continue
            }
            yield* sql`
              INSERT INTO channels(
                id,
                title,
                avatar_urls_json,
                avatar_path,
                created_at,
                updated_at
              ) VALUES (${id}, ${title}, NULL, NULL, ${now}, ${now})
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                updated_at = excluded.updated_at
            `
            yield* synchronizeChannelTitle(id, title)
          }

          for (const item of prepared) {
            const authoritativeChannelTitle =
              authoritativeChannelTitles.get(item.video.channelId) ?? item.video.channelTitle
            const existing = yield* sql<{ readonly id: string }>`
              SELECT id FROM videos WHERE id = ${item.video.id}
            `
            if (existing.length === 0) {
              inserted += 1
            } else {
              updated += 1
            }

            yield* sql`
                  INSERT INTO videos(
                    id,
                    title,
                    channel_id,
                    channel_title,
                    published_at,
                    duration_seconds,
                    thumbnail_urls_json,
                    thumbnail_path,
                    view_count,
                    comment_count,
                    thumbnail_description,
                    embedding_model,
                    embedding_dimensions,
                    created_at,
                    updated_at
                  ) VALUES (
                    ${item.video.id},
                    ${item.video.title},
                    ${item.video.channelId},
                    ${authoritativeChannelTitle},
                    ${new Date(item.publishedEpoch).toISOString()},
                    ${item.video.durationSeconds},
                    ${JSON.stringify(item.video.thumbnails)},
                    ${item.thumbnailPath},
                    ${item.viewCount},
                    ${item.commentCount},
                    ${item.video.thumbnailDescription},
                    ${item.video.titleEmbedding.model},
                    ${embeddingDimensions},
                    ${now},
                    ${now}
                  )
                  ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    channel_id = excluded.channel_id,
                    channel_title = excluded.channel_title,
                    published_at = excluded.published_at,
                    duration_seconds = excluded.duration_seconds,
                    thumbnail_urls_json = excluded.thumbnail_urls_json,
                    thumbnail_path = excluded.thumbnail_path,
                    view_count = excluded.view_count,
                    comment_count = excluded.comment_count,
                    thumbnail_description = excluded.thumbnail_description,
                    embedding_model = excluded.embedding_model,
                    embedding_dimensions = excluded.embedding_dimensions,
                    updated_at = excluded.updated_at
            `
            yield* sql`DELETE FROM video_vectors WHERE video_id = ${item.video.id}`
            yield* insertVector(item, authoritativeChannelTitle)
          }

          for (const item of prepared) {
            if (!(yield* fs.exists(item.thumbnailPath))) {
              yield* fs.writeFile(item.thumbnailPath, item.thumbnailBytes)
            }
          }

          return { total: prepared.length, inserted, updated }
        }),
      ).pipe(Effect.mapError((cause) => storageFailure("upsert prepared video batch", cause)))

      const result = yield* persist.pipe(Effect.onError(() => sweepUnreferencedAssetsBestEffort))
      yield* sweepUnreferencedAssetsBestEffort
      return result
    })

    const searchSemantic = Effect.fn("VideoLibrary.searchSemantic")(function* (
      request: SemanticSearchRequest,
    ) {
      const limit = yield* validateLimit(request.limit, 20)
      yield* validateFilters(request.filters)
      if (request.model.trim().length === 0) {
        return yield* validationFailure("embedding model cannot be empty")
      }
      const queryEmbedding = yield* validateEmbedding(
        {
          model: request.model,
          dimensions: embeddingDimensions,
          values: [...request.embedding],
        },
        "search embedding",
      )
      const filters = makeVectorFilterClauses(sql, request.filters)
      filters.push(sql`embedding_model = ${request.model}`)
      const vectorColumn =
        request.signal === "title"
          ? sql.literal("title_embedding")
          : sql.literal("thumbnail_embedding")

      const rows = yield* sql<SemanticSearchRow>`
        WITH nearest AS (
          SELECT video_id, distance
          FROM video_vectors
          WHERE ${vectorColumn} MATCH ${queryEmbedding}
            AND k = ${limit}
            AND ${sql.and(filters)}
        )
        SELECT v.*, nearest.distance
        FROM nearest
        INNER JOIN videos v ON v.id = nearest.video_id
        ORDER BY nearest.distance ASC
      `.pipe(Effect.mapError((cause) => storageFailure("search video vectors", cause)))

      return yield* Effect.forEach(rows, (row) =>
        decodeStoredVideo(row).pipe(
          Effect.map((video) => ({
            video,
            matchedSignal: request.signal,
            distance: row.distance,
            similarity: 1 - row.distance,
          })),
        ),
      )
    })

    const searchKeyword = Effect.fn("VideoLibrary.searchKeyword")(function* (
      request: KeywordSearchRequest,
    ) {
      const query = request.query.trim()
      if (query.length === 0) {
        return yield* validationFailure("keyword query cannot be empty")
      }
      const limit = yield* validateLimit(request.limit, 20)
      yield* validateFilters(request.filters)
      const filters = makeRelationalFilterClauses(sql, request.filters)
      filters.push(sql`instr(lower(v.title), lower(${query})) > 0`)

      // A substring scan is intentionally simpler than maintaining FTS state and is fast enough
      // for the initial tens-of-thousands local library target.
      const rows = yield* sql<StoredVideoRow>`
        SELECT v.*
        FROM videos v
        WHERE ${sql.and(filters)}
        ORDER BY v.view_count DESC, v.published_at DESC
        LIMIT ${limit}
      `.pipe(Effect.mapError((cause) => storageFailure("search video titles", cause)))

      return yield* Effect.forEach(rows, (row) =>
        decodeStoredVideo(row).pipe(
          Effect.map((video) => ({ video, matchedSignal: "keyword" as const })),
        ),
      )
    })

    const list = Effect.fn("VideoLibrary.list")(function* (options?: ListVideosOptions) {
      const limit = yield* validateLimit(options?.limit, 50)
      const offset = options?.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0) {
        return yield* validationFailure("offset must be a non-negative integer")
      }
      const rows = yield* sql<StoredVideoRow>`
        SELECT * FROM videos
        ORDER BY updated_at DESC, id ASC
        LIMIT ${limit} OFFSET ${offset}
      `.pipe(Effect.mapError((cause) => storageFailure("list videos", cause)))
      return yield* Effect.forEach(rows, decodeStoredVideo)
    })

    const show = Effect.fn("VideoLibrary.show")(function* (id: string) {
      const rows = yield* sql<StoredVideoRow>`SELECT * FROM videos WHERE id = ${id}`.pipe(
        Effect.mapError((cause) => storageFailure("show video", cause)),
      )
      const row = rows[0]
      if (row === undefined) {
        return yield* new NotFoundError({ resource: "video", id })
      }
      return yield* decodeStoredVideo(row)
    })

    const listChannels = Effect.gen(function* () {
      const rows = yield* sql<StoredChannelRow>`
        SELECT * FROM channels
        ORDER BY title COLLATE NOCASE ASC, id ASC
      `.pipe(Effect.mapError((cause) => storageFailure("list channels", cause)))
      return yield* Effect.forEach(rows, decodeStoredChannel)
    }).pipe(Effect.withSpan("VideoLibrary.listChannels"))

    const showChannel = Effect.fn("VideoLibrary.showChannel")(function* (id: string) {
      const rows = yield* sql<StoredChannelRow>`SELECT * FROM channels WHERE id = ${id}`.pipe(
        Effect.mapError((cause) => storageFailure("show channel", cause)),
      )
      const row = rows[0]
      if (row === undefined) {
        return yield* new NotFoundError({ resource: "channel", id })
      }
      return yield* decodeStoredChannel(row)
    })

    const deleteMany = Effect.fn("VideoLibrary.deleteMany")(function* (ids: ReadonlyArray<string>) {
      if (ids.length === 0) {
        return yield* validationFailure("at least one video id is required for deletion")
      }
      if (new Set(ids).size !== ids.length) {
        return yield* validationFailure("video ids for deletion must be unique")
      }

      yield* withThumbnailMutationLock(
        Effect.gen(function* () {
          for (const id of ids) {
            const rows = yield* sql<{ readonly id: string }>`
              SELECT id FROM videos WHERE id = ${id}
            `
            if (rows.length === 0) {
              return yield* new NotFoundError({ resource: "video", id })
            }
          }

          for (const id of ids) {
            yield* sql`DELETE FROM video_vectors WHERE video_id = ${id}`
            yield* sql`DELETE FROM videos WHERE id = ${id}`
          }
        }),
      ).pipe(
        Effect.mapError((cause) =>
          cause instanceof NotFoundError ? cause : storageFailure("delete videos", cause),
        ),
      )
      yield* sweepUnreferencedAssetsBestEffort
    })

    const deleteVideo = Effect.fn("VideoLibrary.delete")((id: string) => deleteMany([id]))

    const replaceEmbeddings = Effect.fn("VideoLibrary.replaceEmbeddings")(function* (
      batch: VideoEmbeddingUpdateBatch,
    ) {
      const ids = batch.videos.map((video) => video.id)
      if (new Set(ids).size !== ids.length) {
        return yield* validationFailure("an embedding batch cannot contain duplicate video ids")
      }

      const validated = yield* Effect.forEach(batch.videos, (update) =>
        Effect.gen(function* () {
          const titleEmbedding = yield* validateEmbedding(
            update.titleEmbedding,
            `title embedding for ${update.id}`,
          )
          const thumbnailEmbedding = yield* validateEmbedding(
            update.thumbnailDescriptionEmbedding,
            `thumbnail embedding for ${update.id}`,
          )
          if (update.titleEmbedding.model !== update.thumbnailDescriptionEmbedding.model) {
            return yield* validationFailure(`embeddings for ${update.id} must use the same model`)
          }
          return { update, titleEmbedding, thumbnailEmbedding }
        }),
      )

      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const now = new Date().toISOString()
            for (const item of validated) {
              const rows = yield* sql<StoredVideoRow>`
                SELECT * FROM videos WHERE id = ${item.update.id}
              `
              const row = rows[0]
              if (row === undefined) {
                return yield* new NotFoundError({ resource: "video", id: item.update.id })
              }

              yield* sql`DELETE FROM video_vectors WHERE video_id = ${item.update.id}`
              yield* sql`
                INSERT INTO video_vectors(
                  video_id,
                  title_embedding,
                  thumbnail_embedding,
                  channel_id,
                  channel_title,
                  published_epoch,
                  duration_seconds,
                  view_count,
                  embedding_model
                ) VALUES (
                  ${row.id},
                  ${item.titleEmbedding},
                  ${item.thumbnailEmbedding},
                  ${row.channel_id},
                  ${row.channel_title},
                  ${Date.parse(row.published_at)},
                  ${row.duration_seconds},
                  ${row.view_count ?? -1},
                  ${item.update.titleEmbedding.model}
                )
              `
              yield* sql`
                UPDATE videos
                SET embedding_model = ${item.update.titleEmbedding.model},
                    embedding_dimensions = ${embeddingDimensions},
                    updated_at = ${now}
                WHERE id = ${item.update.id}
              `
            }
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof NotFoundError
              ? cause
              : storageFailure("replace video embeddings", cause),
          ),
        )
    })

    return VideoLibrary.of({
      upsertPreparedBatch,
      searchSemantic,
      searchKeyword,
      list,
      show,
      delete: deleteVideo,
      deleteMany,
      replaceEmbeddings,
      upsertPreparedChannels,
      listChannels,
      showChannel,
    })
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof StorageError ? cause : storageFailure("initialize video library", cause),
    ),
  )

export const makeVideoLibraryLive = (options: VideoLibraryLayerOptions = {}) =>
  Layer.effect(VideoLibrary, makeVideoLibrary(options)).pipe(Layer.provide(Reactivity.layer))

export const VideoLibraryLive = makeVideoLibraryLive()

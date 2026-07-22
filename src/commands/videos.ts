import { Effect, Schema } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { ValidationError } from "../domain/errors.js"
import { PreparedVideoBatch } from "../domain/video.js"
import { VideoLibraryLive, VideoSearchLive } from "../live-layers.js"
import { success, writeOutput, writeTable } from "../output.js"
import { EmbeddingClient } from "../services/embedding-client.js"
import { type StoredVideo, VideoLibrary } from "../services/video-library.js"
import { readJsonInput } from "./input.js"

const NonEmptyString = Schema.String.check(Schema.isNonEmpty())
const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const ResultLimit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))

const SearchFilters = Schema.Struct({
  channel: Schema.optionalKey(NonEmptyString),
  publishedAfter: Schema.optionalKey(NonEmptyString),
  publishedBefore: Schema.optionalKey(NonEmptyString),
  minDurationSeconds: Schema.optionalKey(NonNegativeInteger),
  maxDurationSeconds: Schema.optionalKey(NonNegativeInteger),
  minViewCount: Schema.optionalKey(NonNegativeInteger),
  maxViewCount: Schema.optionalKey(NonNegativeInteger),
})

const SemanticSearchInput = Schema.Struct({
  mode: Schema.Literal("semantic"),
  signal: Schema.Literals(["title", "thumbnailDescription"]),
  query: NonEmptyString,
  limit: Schema.optionalKey(ResultLimit),
  filters: Schema.optionalKey(SearchFilters),
})

const KeywordSearchInput = Schema.Struct({
  mode: Schema.Literal("keyword"),
  query: NonEmptyString,
  limit: Schema.optionalKey(ResultLimit),
  filters: Schema.optionalKey(SearchFilters),
})

export const VideoSearchInput = Schema.Union([SemanticSearchInput, KeywordSearchInput])

const formatFlag = Flag.choice("format", ["json", "table"]).pipe(Flag.withDefault("json"))
const limitFlag = Flag.integer("limit").pipe(Flag.withDefault(50))
const offsetFlag = Flag.integer("offset").pipe(Flag.withDefault(0))

const videoRows = (videos: ReadonlyArray<StoredVideo>) =>
  videos.map((video) => [
    video.id,
    video.title,
    video.channelTitle,
    video.statistics.viewCount,
    video.publishedAt.slice(0, 10),
  ])

const writeVideos = (videos: ReadonlyArray<StoredVideo>, format: "json" | "table") =>
  format === "table"
    ? writeTable(["ID", "TITLE", "CHANNEL", "VIEWS", "PUBLISHED"], videoRows(videos))
    : writeOutput(success({ videos }))

export const upsertVideos = Effect.fn("videos.upsert")(function* (batch: PreparedVideoBatch) {
  const library = yield* VideoLibrary
  return yield* library.upsertPreparedBatch(batch)
})

const searchKeywordVideos = Effect.fn("videos.search.keyword")(function* (
  input: typeof KeywordSearchInput.Type,
) {
  const library = yield* VideoLibrary
  return yield* library.searchKeyword({
    query: input.query,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.filters === undefined ? {} : { filters: input.filters }),
  })
})

const searchSemanticVideos = Effect.fn("videos.search.semantic")(function* (
  input: typeof SemanticSearchInput.Type,
) {
  const library = yield* VideoLibrary
  const embeddingClient = yield* EmbeddingClient
  const embeddings = yield* embeddingClient.embed([input.query])
  const embedding = embeddings[0]
  if (embedding === undefined) {
    return yield* new ValidationError({ message: "The semantic query could not be embedded" })
  }
  return yield* library.searchSemantic({
    signal: input.signal,
    embedding: embedding.values,
    model: embedding.model,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.filters === undefined ? {} : { filters: input.filters }),
  })
})

export const searchVideos = Effect.fn("videos.search")(function* (
  input: typeof VideoSearchInput.Type,
) {
  if (input.mode === "keyword") {
    return yield* searchKeywordVideos(input)
  }
  return yield* searchSemanticVideos(input)
})

const upsertCommand = Command.make("upsert", { format: formatFlag }, ({ format }) =>
  readJsonInput(PreparedVideoBatch, "Prepared video batch").pipe(
    Effect.flatMap(upsertVideos),
    Effect.flatMap((result) =>
      format === "table"
        ? writeTable(
            ["TOTAL", "INSERTED", "UPDATED"],
            [[String(result.total), String(result.inserted), String(result.updated)]],
          )
        : writeOutput(success(result)),
    ),
    Effect.provide(VideoLibraryLive),
  ),
).pipe(Command.withDescription("Atomically upsert a prepared video batch from JSON stdin"))

const searchCommand = Command.make("search", { format: formatFlag }, ({ format }) =>
  readJsonInput(VideoSearchInput, "Video search").pipe(
    Effect.flatMap((input) =>
      Effect.gen(function* () {
        if (input.mode === "keyword") {
          return yield* searchKeywordVideos(input).pipe(Effect.provide(VideoLibraryLive))
        }
        return yield* searchSemanticVideos(input).pipe(Effect.provide(VideoSearchLive))
      }),
    ),
    Effect.flatMap((results) =>
      format === "table"
        ? writeTable(
            ["ID", "TITLE", "CHANNEL", "SIGNAL", "SCORE"],
            results.map((result) => [
              result.video.id,
              result.video.title,
              result.video.channelTitle,
              result.matchedSignal,
              "similarity" in result ? result.similarity.toFixed(4) : "-",
            ]),
          )
        : writeOutput(success({ results })),
    ),
  ),
).pipe(Command.withDescription("Search titles or thumbnail descriptions from JSON stdin"))

const listCommand = Command.make(
  "list",
  { limit: limitFlag, offset: offsetFlag, format: formatFlag },
  ({ limit, offset, format }) =>
    Effect.gen(function* () {
      const library = yield* VideoLibrary
      const videos = yield* library.list({ limit, offset })
      yield* writeVideos(videos, format)
    }).pipe(Effect.provide(VideoLibraryLive)),
).pipe(Command.withDescription("List videos in the local library"))

const idArgument = Argument.string("id").pipe(Argument.withDescription("YouTube video ID"))

const showCommand = Command.make("show", { id: idArgument, format: formatFlag }, ({ id, format }) =>
  Effect.gen(function* () {
    const library = yield* VideoLibrary
    const video = yield* library.show(id)
    yield* writeVideos([video], format)
  }).pipe(Effect.provide(VideoLibraryLive)),
).pipe(Command.withDescription("Show one stored video"))

const idsArgument = Argument.string("id").pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription("One or more YouTube video IDs"),
)

const deleteCommand = Command.make("delete", { ids: idsArgument }, ({ ids }) =>
  Effect.gen(function* () {
    const library = yield* VideoLibrary
    yield* library.deleteMany(ids)
    yield* writeOutput(success({ deleted: ids }))
  }).pipe(Effect.provide(VideoLibraryLive)),
).pipe(Command.withDescription("Delete videos from the local library"))

const loadAllVideos = Effect.gen(function* () {
  const library = yield* VideoLibrary
  const videos: Array<StoredVideo> = []
  let offset = 0
  while (true) {
    const page = yield* library.list({ limit: 200, offset })
    videos.push(...page)
    if (page.length < 200) {
      return videos
    }
    offset += page.length
  }
})

const chunk = <A>(values: ReadonlyArray<A>, size: number) => {
  const chunks: Array<ReadonlyArray<A>> = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

export const reindexVideos = Effect.gen(function* () {
  const library = yield* VideoLibrary
  const embeddingClient = yield* EmbeddingClient
  const videos = yield* loadAllVideos
  const updates = yield* Effect.forEach(chunk(videos, 500), (page) =>
    Effect.gen(function* () {
      const inputs = page.flatMap((video) => [video.title, video.thumbnailDescription])
      const embeddings = yield* embeddingClient.embed(inputs)
      return yield* Effect.forEach(page, (video, index) => {
        const titleEmbedding = embeddings[index * 2]
        const thumbnailDescriptionEmbedding = embeddings[index * 2 + 1]
        return titleEmbedding === undefined || thumbnailDescriptionEmbedding === undefined
          ? Effect.fail(
              new ValidationError({ message: `Embeddings were missing for video ${video.id}` }),
            )
          : Effect.succeed({
              id: video.id,
              titleEmbedding,
              thumbnailDescriptionEmbedding,
            })
      })
    }),
  )
  const flattened = updates.flat()
  yield* library.replaceEmbeddings({ videos: flattened })
  return { reindexed: flattened.length }
})

const reindexCommand = Command.make("reindex", {}, () =>
  reindexVideos.pipe(
    Effect.flatMap((result) => writeOutput(success(result))),
    Effect.provide(VideoSearchLive),
  ),
).pipe(Command.withDescription("Recreate every stored title and thumbnail-description embedding"))

export const videosCommand = Command.make("videos").pipe(
  Command.withDescription("Manage and search the local YouTube library"),
  Command.withSubcommands([
    upsertCommand,
    searchCommand,
    listCommand,
    showCommand,
    deleteCommand,
    reindexCommand,
  ]),
)

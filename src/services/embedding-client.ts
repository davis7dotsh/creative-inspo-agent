import { Context, Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import {
  type AuthenticationError,
  OpenAIError,
  type StorageError,
  ValidationError,
} from "../domain/errors.js"
import type { Embedding } from "../domain/video.js"
import { AppConfig } from "./app-config.js"
import { AuthStore } from "./auth-store.js"

const OpenAIEmbeddingRequest = Schema.Struct({
  model: Schema.String,
  input: Schema.Array(Schema.String),
  dimensions: Schema.Int,
  encoding_format: Schema.Literal("float"),
})

const OpenAIEmbeddingResponse = Schema.Struct({
  object: Schema.Literal("list"),
  model: Schema.String,
  data: Schema.Array(
    Schema.Struct({
      object: Schema.Literal("embedding"),
      embedding: Schema.Array(Schema.Finite),
      index: Schema.Int,
    }),
  ),
})

export type EmbedOptions = {
  readonly model?: string
  readonly dimensions?: number
}

export type EmbeddingClientShape = {
  readonly embed: (
    inputs: ReadonlyArray<string>,
    options?: EmbedOptions,
  ) => Effect.Effect<
    ReadonlyArray<Embedding>,
    AuthenticationError | OpenAIError | StorageError | ValidationError
  >
}

const openAIError = (message: string) =>
  new OpenAIError({
    operation: "create embeddings",
    message,
  })

const makeEmbeddingClient = Effect.gen(function* () {
  const auth = yield* AuthStore
  const config = yield* AppConfig
  const http = yield* HttpClient.HttpClient

  const embed = Effect.fn("EmbeddingClient.embed")(function* (
    inputs: ReadonlyArray<string>,
    options?: EmbedOptions,
  ) {
    if (
      inputs.length === 0 ||
      inputs.length > 2048 ||
      inputs.some((input) => input.trim().length === 0)
    ) {
      return yield* new ValidationError({
        message: "Embedding inputs must contain between 1 and 2048 non-empty text values",
      })
    }

    const model = options?.model ?? config.embeddingModel
    const dimensions = options?.dimensions ?? config.embeddingDimensions
    if (model.trim().length === 0 || !Number.isSafeInteger(dimensions) || dimensions <= 0) {
      return yield* new ValidationError({
        message: "Embedding model and dimensions must be valid",
      })
    }

    const apiKey = yield* auth.apiKey
    const request = yield* HttpClientRequest.post("https://api.openai.com/v1/embeddings").pipe(
      HttpClientRequest.bearerToken(apiKey),
      HttpClientRequest.acceptJson,
      HttpClientRequest.schemaBodyJson(OpenAIEmbeddingRequest)({
        model,
        input: inputs,
        dimensions,
        encoding_format: "float",
      }),
      Effect.mapError(() => openAIError("Could not encode the embeddings request")),
    )

    const response = yield* http.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(OpenAIEmbeddingResponse)),
      Effect.mapError(() => openAIError("The OpenAI embeddings request failed")),
    )

    const ordered = Array.from(response.data).sort((left, right) => left.index - right.index)
    const validIndexes = ordered.every((item, index) => item.index === index)
    const validDimensions = ordered.every((item) => item.embedding.length === dimensions)
    if (ordered.length !== inputs.length || !validIndexes || !validDimensions) {
      return yield* openAIError("OpenAI returned an invalid embeddings response")
    }

    return ordered.map((item) => ({
      model: response.model,
      dimensions,
      values: item.embedding,
    }))
  })

  return EmbeddingClient.of({ embed })
})

export class EmbeddingClient extends Context.Service<EmbeddingClient, EmbeddingClientShape>()(
  "creative-agent/EmbeddingClient",
) {
  static readonly layer = Layer.effect(this, makeEmbeddingClient)

  static readonly layerFrom = (client: EmbeddingClientShape) => Layer.succeed(this)(client)
}

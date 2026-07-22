import { Effect, Schema } from "effect"
import { Command } from "effect/unstable/cli"
import { ValidationError } from "../domain/errors.js"
import { EmbeddingLive } from "../live-layers.js"
import { success, writeOutput } from "../output.js"
import { EmbeddingClient } from "../services/embedding-client.js"
import { readJsonInput } from "./input.js"

const NonEmptyString = Schema.String.check(Schema.isNonEmpty())

export const EmbedInput = Schema.Struct({
  inputs: Schema.Array(
    Schema.Struct({
      id: NonEmptyString,
      text: NonEmptyString,
    }),
  ).check(Schema.isLengthBetween(1, 2048)),
})

export const embedTexts = Effect.fn("embed.texts")(function* (inputs: ReadonlyArray<string>) {
  const client = yield* EmbeddingClient
  return yield* client.embed(inputs)
})

export const embedItems = Effect.fn("embed.items")(function* (input: typeof EmbedInput.Type) {
  const ids = input.inputs.map((item) => item.id.trim())
  if (input.inputs.length === 0 || ids.some((id) => id.length === 0)) {
    return yield* new ValidationError({ message: "Embedding inputs must include an id and text" })
  }
  if (new Set(ids).size !== ids.length) {
    return yield* new ValidationError({ message: "Embedding input ids must be unique" })
  }
  const embeddings = yield* embedTexts(input.inputs.map((item) => item.text))
  return {
    items: input.inputs.map((item, index) => ({
      id: item.id,
      embedding: embeddings[index],
    })),
  }
})

export const embedCommand = Command.make("embed", {}, () =>
  readJsonInput(EmbedInput, "Embedding input").pipe(
    Effect.flatMap(embedItems),
    Effect.flatMap((result) => writeOutput(success(result))),
    Effect.provide(EmbeddingLive),
  ),
).pipe(Command.withDescription("Create OpenAI embeddings for prepared text"))

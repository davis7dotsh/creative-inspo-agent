import { Schema } from "effect"
import { Command } from "effect/unstable/cli"
import { PreparedChannelBatch, PreparedVideoBatch } from "../domain/video.js"
import { success, writeOutput } from "../output.js"
import { EmbedInput } from "./embed.js"
import { VideoSearchInput } from "./videos.js"

const writeSchema = (command: string, input: Schema.Top) =>
  writeOutput(
    success({
      command,
      input: "stdin",
      schema: Schema.toJsonSchemaDocument(input),
    }),
  )

const embedSchemaCommand = Command.make("embed", {}, () =>
  writeSchema("creative-agent embed", EmbedInput),
).pipe(Command.withDescription("Print the JSON stdin schema for embedding text"))

const videosUpsertSchemaCommand = Command.make("videos-upsert", {}, () =>
  writeSchema("creative-agent videos upsert", PreparedVideoBatch),
).pipe(Command.withDescription("Print the JSON stdin schema for prepared video batches"))

const channelsUpsertSchemaCommand = Command.make("channels-upsert", {}, () =>
  writeSchema("creative-agent channels upsert", PreparedChannelBatch),
).pipe(Command.withDescription("Print the JSON stdin schema for prepared channel batches"))

const videosSearchSchemaCommand = Command.make("videos-search", {}, () =>
  writeSchema("creative-agent videos search", VideoSearchInput),
).pipe(Command.withDescription("Print the JSON stdin schema for video searches"))

export const schemaCommand = Command.make("schema").pipe(
  Command.withDescription("Print machine-readable JSON stdin contracts"),
  Command.withSubcommands([
    embedSchemaCommand,
    videosUpsertSchemaCommand,
    channelsUpsertSchemaCommand,
    videosSearchSchemaCommand,
  ]),
)

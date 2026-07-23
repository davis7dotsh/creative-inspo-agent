import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { PreparedChannelBatch } from "../domain/video.js"
import { VideoLibraryLive } from "../live-layers.js"
import { success, writeOutput, writeTable } from "../output.js"
import { type StoredChannel, VideoLibrary } from "../services/video-library.js"
import { readJsonInput } from "./input.js"

const formatFlag = Flag.choice("format", ["json", "table"]).pipe(Flag.withDefault("json"))

const channelRows = (channels: ReadonlyArray<StoredChannel>) =>
  channels.map((channel) => [
    channel.id,
    channel.title,
    channel.localAvatarPath === undefined ? "no" : "yes",
  ])

const writeChannels = (channels: ReadonlyArray<StoredChannel>, format: "json" | "table") =>
  format === "table"
    ? writeTable(["ID", "TITLE", "AVATAR"], channelRows(channels))
    : writeOutput(success({ channels }))

const upsertCommand = Command.make("upsert", { format: formatFlag }, ({ format }) =>
  readJsonInput(PreparedChannelBatch, "Prepared channel batch").pipe(
    Effect.flatMap((batch) =>
      Effect.gen(function* () {
        const library = yield* VideoLibrary
        return yield* library.upsertPreparedChannels(batch)
      }),
    ),
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
).pipe(Command.withDescription("Atomically upsert prepared channel avatars from JSON stdin"))

const listCommand = Command.make("list", { format: formatFlag }, ({ format }) =>
  Effect.gen(function* () {
    const library = yield* VideoLibrary
    yield* writeChannels(yield* library.listChannels, format)
  }).pipe(Effect.provide(VideoLibraryLive)),
).pipe(Command.withDescription("List channels in the local library"))

const idArgument = Argument.string("id").pipe(Argument.withDescription("YouTube channel ID"))

const showCommand = Command.make("show", { id: idArgument, format: formatFlag }, ({ id, format }) =>
  Effect.gen(function* () {
    const library = yield* VideoLibrary
    yield* writeChannels([yield* library.showChannel(id)], format)
  }).pipe(Effect.provide(VideoLibraryLive)),
).pipe(Command.withDescription("Show one stored channel"))

export const channelsCommand = Command.make("channels").pipe(
  Command.withDescription("Manage YouTube channels and retained avatars"),
  Command.withSubcommands([upsertCommand, listCommand, showCommand]),
)

import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { LocalStateLive } from "../live-layers.js"
import { success, writeOutput } from "../output.js"
import { initializeAppPaths } from "../services/app-paths.js"

export const getStatus = Effect.gen(function* () {
  const paths = yield* initializeAppPaths

  return {
    version: "0.1.0",
    storage: {
      root: paths.root,
      config: paths.configFile,
      database: paths.databaseFile,
      thumbnails: paths.thumbnailsDirectory,
      staging: paths.stagingDirectory,
      boards: paths.boardsDirectory,
    },
  }
})

export const statusCommand = Command.make("status", {}, () =>
  getStatus.pipe(
    Effect.flatMap((status) => writeOutput(success(status))),
    Effect.provide(LocalStateLive),
  ),
).pipe(Command.withDescription("Initialize and inspect local Creative Agent state"))

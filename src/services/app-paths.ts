import { Config, Context, Effect, FileSystem, Layer, Option, Path } from "effect"
import { StorageError } from "../domain/errors.js"

export type AppPathsShape = {
  readonly root: string
  readonly authFile: string
  readonly configFile: string
  readonly databaseFile: string
  readonly assetsDirectory: string
  readonly thumbnailsDirectory: string
  readonly channelAvatarsDirectory: string
  readonly stagingDirectory: string
  readonly boardsDirectory: string
}

export const makeAppPaths = (path: Path.Path, root: string): AppPathsShape => {
  const resolvedRoot = path.resolve(root)
  const assetsDirectory = path.join(resolvedRoot, "assets")

  return {
    root: resolvedRoot,
    authFile: path.join(resolvedRoot, "auth.json"),
    configFile: path.join(resolvedRoot, "config.json"),
    databaseFile: path.join(resolvedRoot, "creative-agent.sqlite"),
    assetsDirectory,
    thumbnailsDirectory: path.join(assetsDirectory, "thumbnails"),
    channelAvatarsDirectory: path.join(assetsDirectory, "channel-avatars"),
    stagingDirectory: path.join(resolvedRoot, "staging"),
    boardsDirectory: path.join(resolvedRoot, "boards"),
  }
}

const configuredPaths = Effect.gen(function* () {
  const path = yield* Path.Path
  const override = yield* Config.option(Config.nonEmptyString("CREATIVE_AGENT_HOME"))
  const root = Option.isSome(override)
    ? override.value
    : path.join(yield* Config.nonEmptyString("HOME"), ".creative-inspo-agent")

  return makeAppPaths(path, root)
})

export class AppPaths extends Context.Service<AppPaths, AppPathsShape>()(
  "creative-agent/AppPaths",
) {
  static readonly layer = Layer.effect(this, configuredPaths)

  static readonly layerFor = (root: string) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        return makeAppPaths(yield* Path.Path, root)
      }),
    )
}

const defaultConfig = `${JSON.stringify(
  {
    embeddingModel: "text-embedding-3-large",
    embeddingDimensions: 1536,
    thumbnailDescriptionModel: "gpt-5.6-luna",
  },
  null,
  2,
)}\n`

export const initializeAppPaths = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* AppPaths
  const directories = [
    paths.root,
    paths.assetsDirectory,
    paths.thumbnailsDirectory,
    paths.channelAvatarsDirectory,
    paths.stagingDirectory,
    paths.boardsDirectory,
  ]

  yield* Effect.forEach(directories, (directory) =>
    fs.makeDirectory(directory, { recursive: true }),
  )

  if (!(yield* fs.exists(paths.configFile))) {
    yield* fs.writeFileString(paths.configFile, defaultConfig, { mode: 0o600 })
  }

  return paths
}).pipe(
  Effect.mapError(
    (error) =>
      new StorageError({
        operation: "initialize local state",
        message: String(error),
      }),
  ),
)

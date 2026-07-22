import { Config, Context, Effect, Layer, Option, Path } from "effect"

export type ExplorerPathsShape = {
  readonly root: string
  readonly databaseFile: string
  readonly thumbnailsDirectory: string
  readonly channelAvatarsDirectory: string
  readonly port: number
}

export const makeExplorerPaths = (path: Path.Path, root: string, port = 4318) => {
  const resolvedRoot = path.resolve(root)
  const assets = path.join(resolvedRoot, "assets")

  return {
    root: resolvedRoot,
    databaseFile: path.join(resolvedRoot, "creative-agent.sqlite"),
    thumbnailsDirectory: path.join(assets, "thumbnails"),
    channelAvatarsDirectory: path.join(assets, "channel-avatars"),
    port,
  } satisfies ExplorerPathsShape
}

const configuredPaths = Effect.gen(function* () {
  const path = yield* Path.Path
  const override = yield* Config.option(Config.nonEmptyString("CREATIVE_AGENT_HOME"))
  const root = Option.isSome(override)
    ? override.value
    : path.join(yield* Config.nonEmptyString("HOME"), ".creative-inspo-agent")
  const port = yield* Config.number("ASSETS_EXPLORER_PORT").pipe(Config.withDefault(4318))

  return makeExplorerPaths(path, root, port)
})

export class ExplorerPaths extends Context.Service<ExplorerPaths, ExplorerPathsShape>()(
  "assets-explorer/ExplorerPaths",
) {
  static readonly layer = Layer.effect(this, configuredPaths)

  static readonly layerFor = (root: string, port = 4318) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        return makeExplorerPaths(yield* Path.Path, root, port)
      }),
    )
}

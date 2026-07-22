import { NodeServices } from "@effect/platform-node"
import { ConfigProvider, Effect, FileSystem, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { getStatus } from "../src/commands/status.js"
import { AppPaths, initializeAppPaths } from "../src/services/app-paths.js"

describe("AppPaths", () => {
  it("uses CREATIVE_AGENT_HOME and initializes the local layout", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-test-" })
        const configLayer = ConfigProvider.layer(
          ConfigProvider.fromEnv({
            env: {
              CREATIVE_AGENT_HOME: root,
              HOME: "/unused",
            },
          }),
        )
        const appPathsLayer = AppPaths.layer.pipe(
          Layer.provide(NodeServices.layer),
          Layer.provide(configLayer),
        )
        const layer = Layer.merge(NodeServices.layer, appPathsLayer)
        const paths = yield* initializeAppPaths.pipe(Effect.provide(layer))

        return {
          paths,
          configExists: yield* fs.exists(paths.configFile),
          thumbnailsExist: yield* fs.exists(paths.thumbnailsDirectory),
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )

    expect(result.paths.root).toContain("creative-agent-test-")
    expect(result.configExists).toBe(true)
    expect(result.thumbnailsExist).toBe(true)
  })

  it("returns stable status data", async () => {
    const status = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-test-" })
        const appPathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
        const layer = Layer.merge(NodeServices.layer, appPathsLayer)
        const value = yield* getStatus.pipe(Effect.provide(layer))

        return { root, value }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )

    expect(status.value).toMatchObject({
      version: "0.1.0",
      storage: {
        root: status.root,
        database: `${status.root}/creative-agent.sqlite`,
      },
    })
  })
})

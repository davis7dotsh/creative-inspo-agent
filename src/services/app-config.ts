import { Context, Effect, FileSystem, Layer, Schema } from "effect"
import { ConfigurationError } from "../domain/errors.js"
import { initializeAppPaths } from "./app-paths.js"

const NonEmptyString = Schema.String.check(Schema.isNonEmpty())

export const AppConfigFile = Schema.Struct({
  embeddingModel: NonEmptyString,
  embeddingDimensions: Schema.Int.check(Schema.isBetween({ minimum: 1536, maximum: 1536 })),
  thumbnailDescriptionModel: NonEmptyString,
})

export type AppConfigShape = typeof AppConfigFile.Type

const decodeConfig = Schema.decodeUnknownEffect(Schema.fromJsonString(AppConfigFile))

const loadAppConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* initializeAppPaths
  const contents = yield* fs.readFileString(paths.configFile).pipe(
    Effect.mapError(
      () =>
        new ConfigurationError({
          message: "Could not read the Creative Agent configuration",
        }),
    ),
  )

  return yield* decodeConfig(contents).pipe(
    Effect.mapError(
      () =>
        new ConfigurationError({
          message: "The Creative Agent configuration is invalid",
        }),
    ),
  )
})

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()(
  "creative-agent/AppConfig",
) {
  static readonly layer = Layer.effect(this, loadAppConfig)

  static readonly layerFrom = (config: AppConfigShape) => Layer.succeed(this)(config)
}

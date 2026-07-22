import { createServer } from "node:http"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ExplorerApi } from "../contracts/api.js"
import { ExplorerApiHandlers } from "./http/api-handlers.js"
import { MediaRoutes } from "./http/media-routes.js"
import { LocalAssetCatalog, LocalAssetMedia } from "./layers/local-asset-services.js"
import { ExplorerPaths } from "./services/explorer-paths.js"

const NodePlatform = NodeServices.layer

export const ExplorerPathsLive = ExplorerPaths.layer.pipe(Layer.provide(NodePlatform))

export const ExplorerDatabaseLive = Layer.unwrap(
  ExplorerPaths.pipe(
    Effect.map((paths) =>
      SqliteClient.layer({
        filename: paths.databaseFile,
        readonly: true,
        disableWAL: true,
      }),
    ),
  ),
).pipe(Layer.provide(ExplorerPathsLive))

const LocalServices = Layer.mergeAll(LocalAssetCatalog, LocalAssetMedia).pipe(
  Layer.provide(ExplorerDatabaseLive),
  Layer.provide(ExplorerPathsLive),
  Layer.provide(NodePlatform),
)

const ApiRoutes = HttpApiBuilder.layer(ExplorerApi).pipe(Layer.provide(ExplorerApiHandlers))

const AppRoutes = Layer.mergeAll(ApiRoutes, MediaRoutes).pipe(Layer.provide(LocalServices))

const NodeServer = Layer.unwrap(
  ExplorerPaths.pipe(
    Effect.map((paths) =>
      NodeHttpServer.layer(createServer, {
        host: "127.0.0.1",
        port: paths.port,
      }),
    ),
  ),
).pipe(Layer.provide(ExplorerPathsLive))

export const AssetsExplorerServer = HttpRouter.serve(AppRoutes, { disableLogger: true }).pipe(
  Layer.provide(NodeServer),
)

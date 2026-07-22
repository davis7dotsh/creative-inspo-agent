import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { AppConfig } from "./services/app-config.js"
import { AppPaths } from "./services/app-paths.js"
import { AuthStore } from "./services/auth-store.js"
import { EmbeddingClient } from "./services/embedding-client.js"
import { VideoLibraryLive as VideoLibraryServiceLive } from "./services/video-library.js"

const pathsLayer = AppPaths.layer.pipe(Layer.provide(NodeServices.layer))
const localStateLayer = Layer.merge(NodeServices.layer, pathsLayer)
const configLayer = AppConfig.layer.pipe(Layer.provide(localStateLayer))
const authLayer = AuthStore.layer.pipe(Layer.provide(localStateLayer))
const embeddingDependencies = Layer.mergeAll(configLayer, authLayer, FetchHttpClient.layer)
const embeddingLayer = EmbeddingClient.layer.pipe(Layer.provide(embeddingDependencies))
const videoLibraryLayer = VideoLibraryServiceLive.pipe(Layer.provide(localStateLayer))

export const LocalStateLive = localStateLayer

export const AuthLive = Layer.merge(localStateLayer, authLayer)

export const EmbeddingLive = Layer.mergeAll(
  localStateLayer,
  configLayer,
  authLayer,
  FetchHttpClient.layer,
  embeddingLayer,
)

export const VideoLibraryLive = Layer.merge(localStateLayer, videoLibraryLayer)

export const VideoSearchLive = Layer.merge(VideoLibraryLive, EmbeddingLive)

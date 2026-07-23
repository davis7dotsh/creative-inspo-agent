import { Context, type Effect, type Stream } from "effect"
import type { MediaNotFoundError, MediaReadError } from "../domain/errors.js"

export type AssetMediaFile = {
  readonly body: Stream.Stream<Uint8Array, MediaReadError>
  readonly contentLength: number
  readonly contentType: string
}

export type AssetMediaShape = {
  readonly getThumbnail: (
    id: string,
  ) => Effect.Effect<AssetMediaFile, MediaNotFoundError | MediaReadError>
  readonly getCreatorAvatar: (
    id: string,
  ) => Effect.Effect<AssetMediaFile, MediaNotFoundError | MediaReadError>
}

export class AssetMedia extends Context.Service<AssetMedia, AssetMediaShape>()(
  "assets-explorer/AssetMedia",
) {}

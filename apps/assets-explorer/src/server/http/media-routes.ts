import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/unstable/http"
import { AssetMedia } from "../services/asset-media.js"
import type { AssetMediaFile } from "../services/asset-media.js"
import type { MediaNotFoundError, MediaReadError } from "../domain/errors.js"

const mediaResponse = (read: Effect.Effect<AssetMediaFile, MediaNotFoundError | MediaReadError>) =>
  read.pipe(
    Effect.map((file) =>
      HttpServerResponse.stream(file.body, {
        contentType: file.contentType,
        contentLength: file.contentLength,
        headers: {
          "cache-control": "private, max-age=86400",
          "x-content-type-options": "nosniff",
        },
      }),
    ),
    Effect.catchTags({
      MediaNotFoundError: () => Effect.succeed(HttpServerResponse.empty({ status: 404 })),
      MediaReadError: () => Effect.succeed(HttpServerResponse.empty({ status: 500 })),
    }),
  )

export const MediaRoutes = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter
    const media = yield* AssetMedia

    yield* router.add(
      "GET",
      "/api/assets/:id/thumbnail",
      Effect.gen(function* () {
        const { params } = yield* HttpRouter.RouteContext
        const id = params.id
        return id
          ? yield* mediaResponse(media.getThumbnail(id))
          : HttpServerResponse.empty({ status: 404 })
      }),
    )

    yield* router.add(
      "GET",
      "/api/creators/:id/avatar",
      Effect.gen(function* () {
        const { params } = yield* HttpRouter.RouteContext
        const id = params.id
        return id
          ? yield* mediaResponse(media.getCreatorAvatar(id))
          : HttpServerResponse.empty({ status: 404 })
      }),
    )
  }),
)

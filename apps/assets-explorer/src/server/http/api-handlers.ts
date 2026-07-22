import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { ExplorerApi } from "../../contracts/api.js"
import { AssetCatalog } from "../services/asset-catalog.js"

export const ExplorerApiHandlers = HttpApiBuilder.group(
  ExplorerApi,
  "explorer",
  Effect.fnUntraced(function* (handlers) {
    const catalog = yield* AssetCatalog

    return handlers
      .handle("listCreators", () =>
        catalog.listCreators.pipe(Effect.mapError(() => new HttpApiError.InternalServerError())),
      )
      .handle("listAssets", ({ query }) =>
        catalog
          .listAssets({
            ...(query.creatorId !== undefined ? { creatorId: query.creatorId } : {}),
            sort: query.sort ?? "random",
            limit: query.limit ?? 72,
            ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
          })
          .pipe(
            Effect.catchTags({
              InvalidCursorError: () => Effect.fail(HttpApiError.BadRequest.singleton),
              CatalogError: () => Effect.fail(new HttpApiError.InternalServerError()),
            }),
          ),
      )
  }),
)

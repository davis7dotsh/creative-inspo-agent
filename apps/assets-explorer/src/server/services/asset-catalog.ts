import { Context, type Effect } from "effect"
import type { AssetPage, CreatorSummary, SortOrder } from "../../contracts/api.js"
import type { CatalogError, InvalidCursorError } from "../domain/errors.js"

export type ListAssetsRequest = {
  readonly creatorId?: string
  readonly sort: SortOrder
  readonly limit: number
  readonly cursor?: string
}

export type AssetCatalogShape = {
  readonly listCreators: Effect.Effect<ReadonlyArray<CreatorSummary>, CatalogError>
  readonly listAssets: (
    request: ListAssetsRequest,
  ) => Effect.Effect<AssetPage, CatalogError | InvalidCursorError>
}

export class AssetCatalog extends Context.Service<AssetCatalog, AssetCatalogShape>()(
  "assets-explorer/AssetCatalog",
) {}

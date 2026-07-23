import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"

export const SortOrder = Schema.Literals(["random", "newest", "oldest", "mostViewed"])
export type SortOrder = typeof SortOrder.Type

export const CreatorSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  assetCount: Schema.Int,
  avatarUrl: Schema.String,
})
export type CreatorSummary = typeof CreatorSummary.Type

export const Asset = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  creatorId: Schema.String,
  creatorTitle: Schema.String,
  publishedAt: Schema.String,
  durationSeconds: Schema.Int,
  viewCount: Schema.String,
  thumbnailUrl: Schema.String,
  creatorAvatarUrl: Schema.String,
  youtubeUrl: Schema.String,
})
export type Asset = typeof Asset.Type

export const AssetPage = Schema.Struct({
  items: Schema.Array(Asset),
  nextCursor: Schema.optionalKey(Schema.String),
  total: Schema.Int,
})
export type AssetPage = typeof AssetPage.Type

export const AssetsQuery = {
  creatorId: Schema.optionalKey(Schema.String),
  sort: Schema.optionalKey(SortOrder),
  limit: Schema.optionalKey(
    Schema.FiniteFromString.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 120 })),
  ),
  cursor: Schema.optionalKey(Schema.String),
}

const explorerGroup = HttpApiGroup.make("explorer", { topLevel: true })
  .add(
    HttpApiEndpoint.get("listCreators", "/api/creators", {
      success: Schema.Array(CreatorSummary),
      error: HttpApiError.InternalServerError,
    }),
  )
  .add(
    HttpApiEndpoint.get("listAssets", "/api/assets", {
      query: AssetsQuery,
      success: AssetPage,
      error: [HttpApiError.BadRequest, HttpApiError.InternalServerError],
    }),
  )

export const ExplorerApi = HttpApi.make("assets-explorer").add(explorerGroup)

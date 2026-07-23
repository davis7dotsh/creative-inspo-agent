import type { AssetPage, CreatorSummary, SortOrder } from "../contracts/api.js"

const readJson = async <A>(response: Response) => {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return (await response.json()) as A
}

export const fetchCreators = (signal?: AbortSignal) =>
  fetch("/api/creators", signal ? { signal } : {}).then((response) =>
    readJson<ReadonlyArray<CreatorSummary>>(response),
  )

export const fetchAssets = (
  request: {
    readonly creatorId?: string
    readonly sort: SortOrder
    readonly cursor?: string
    readonly limit?: number
  },
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams({
    sort: request.sort,
    limit: String(request.limit ?? 84),
  })

  if (request.creatorId) query.set("creatorId", request.creatorId)
  if (request.cursor) query.set("cursor", request.cursor)

  return fetch(`/api/assets?${query}`, signal ? { signal } : {}).then((response) =>
    readJson<AssetPage>(response),
  )
}

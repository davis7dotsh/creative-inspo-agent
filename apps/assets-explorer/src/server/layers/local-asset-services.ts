import { FileSystem, Effect, Layer, Path, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { Asset, CreatorSummary, SortOrder } from "../../contracts/api.js"
import { decodeCursor, encodeCursor, type CursorPayload } from "../domain/cursor.js"
import { CatalogError, MediaNotFoundError, MediaReadError } from "../domain/errors.js"
import { AssetCatalog, type ListAssetsRequest } from "../services/asset-catalog.js"
import { AssetMedia, type AssetMediaFile } from "../services/asset-media.js"
import { ExplorerPaths } from "../services/explorer-paths.js"

type CreatorRow = {
  readonly id: string
  readonly title: string
  readonly asset_count: number
  readonly avatar_path: string
}

type AssetRow = {
  readonly id: string
  readonly title: string
  readonly channel_id: string
  readonly channel_title: string
  readonly published_at: string
  readonly duration_seconds: number
  readonly view_count: number | null
  readonly thumbnail_path: string
  readonly avatar_path: string
  readonly sort_value: string | number
}

type CountRow = { readonly total: number }
type MediaPathRow = { readonly path: string }

const contentTypeFor = (path: string) => {
  const extension = path.toLowerCase().split(".").pop()

  if (extension === "png") return "image/png"
  if (extension === "webp") return "image/webp"
  if (extension === "gif") return "image/gif"
  if (extension === "avif") return "image/avif"
  return "image/jpeg"
}

const withinDirectory = (path: Path.Path, directory: string, candidate: string) => {
  const relative = path.relative(directory, candidate)
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

const openMediaFile = (
  id: string,
  candidate: string,
  approvedDirectory: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<AssetMediaFile, MediaNotFoundError | MediaReadError> =>
  Effect.gen(function* () {
    const [realDirectory, realCandidate] = yield* Effect.all([
      fs.realPath(approvedDirectory),
      fs.realPath(candidate),
    ]).pipe(Effect.mapError(() => new MediaNotFoundError({ id })))

    if (!withinDirectory(path, realDirectory, realCandidate)) {
      return yield* new MediaNotFoundError({ id })
    }

    const info = yield* fs
      .stat(realCandidate)
      .pipe(Effect.mapError((error) => new MediaReadError({ id, message: String(error) })))

    if (info.type !== "File") {
      return yield* new MediaNotFoundError({ id })
    }

    return {
      body: fs
        .stream(realCandidate)
        .pipe(Stream.mapError((error) => new MediaReadError({ id, message: String(error) }))),
      contentLength: Number(info.size),
      contentType: contentTypeFor(realCandidate),
    }
  })

const fileIsAvailable = (
  candidate: string,
  approvedDirectory: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
) =>
  openMediaFile("availability-check", candidate, approvedDirectory, fs, path).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  )

const randomExpression = `(
  (
    unicode(substr(v.id, 1, 1)) * 1103515245 +
    unicode(substr(v.id, 3, 1)) * 12345 +
    unicode(substr(v.id, 6, 1)) * 2654435761 +
    unicode(substr(v.id, -1, 1)) * 214013
  ) * (
    (? % 8191) * 2 + 1
  ) % 2147483647
)`

const sortParts = (sort: SortOrder, cursor: CursorPayload | undefined, seed: number) => {
  if (sort === "newest") {
    return {
      select: "v.published_at",
      where: cursor ? "AND (v.published_at < ? OR (v.published_at = ? AND v.id > ?))" : "",
      whereParams: cursor ? [cursor.value, cursor.value, cursor.id] : [],
      order: "v.published_at DESC, v.id ASC",
      selectParams: [],
    }
  }

  if (sort === "oldest") {
    return {
      select: "v.published_at",
      where: cursor ? "AND (v.published_at > ? OR (v.published_at = ? AND v.id > ?))" : "",
      whereParams: cursor ? [cursor.value, cursor.value, cursor.id] : [],
      order: "v.published_at ASC, v.id ASC",
      selectParams: [],
    }
  }

  if (sort === "mostViewed") {
    return {
      select: "COALESCE(v.view_count, -1)",
      where: cursor
        ? "AND (COALESCE(v.view_count, -1) < ? OR (COALESCE(v.view_count, -1) = ? AND v.id > ?))"
        : "",
      whereParams: cursor ? [cursor.value, cursor.value, cursor.id] : [],
      order: "COALESCE(v.view_count, -1) DESC, v.id ASC",
      selectParams: [],
    }
  }

  return {
    select: randomExpression,
    where: cursor ? `AND (${randomExpression} > ? OR (${randomExpression} = ? AND v.id > ?))` : "",
    whereParams: cursor ? [seed, cursor.value, seed, cursor.value, cursor.id] : [],
    order: "sort_value ASC, v.id ASC",
    selectParams: [seed],
  }
}

const rowCursor = (row: AssetRow, request: ListAssetsRequest, seed: number): CursorPayload => ({
  version: 1,
  sort: request.sort,
  creatorId: request.creatorId ?? null,
  value: row.sort_value,
  id: row.id,
  ...(request.sort === "random" ? { seed } : {}),
})

const rowAsset = (row: AssetRow): Asset => ({
  id: row.id,
  title: row.title,
  creatorId: row.channel_id,
  creatorTitle: row.channel_title,
  publishedAt: row.published_at,
  durationSeconds: row.duration_seconds,
  viewCount: String(row.view_count ?? 0),
  thumbnailUrl: `/api/assets/${encodeURIComponent(row.id)}/thumbnail`,
  creatorAvatarUrl: `/api/creators/${encodeURIComponent(row.channel_id)}/avatar`,
  youtubeUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(row.id)}`,
})

export const LocalAssetCatalog = Layer.effect(
  AssetCatalog,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const paths = yield* ExplorerPaths

    const listCreators = sql
      .unsafe<CreatorRow>(
        `SELECT
          c.id,
          c.title,
          COUNT(v.id) AS asset_count,
          c.avatar_path
        FROM channels AS c
        INNER JOIN videos AS v ON v.channel_id = c.id
        WHERE c.avatar_path IS NOT NULL
          AND v.thumbnail_path <> ''
        GROUP BY c.id, c.title, c.avatar_path
        ORDER BY c.title COLLATE NOCASE ASC, c.id ASC`,
      )
      .pipe(
        Effect.mapError(
          (error) => new CatalogError({ operation: "list creators", message: String(error) }),
        ),
        Effect.flatMap((rows) =>
          Effect.filter(rows, (row) =>
            fileIsAvailable(row.avatar_path, paths.channelAvatarsDirectory, fs, path),
          ),
        ),
        Effect.map((rows) =>
          rows.map(
            (row): CreatorSummary => ({
              id: row.id,
              title: row.title,
              assetCount: row.asset_count,
              avatarUrl: `/api/creators/${encodeURIComponent(row.id)}/avatar`,
            }),
          ),
        ),
      )

    const listAssets = (request: ListAssetsRequest) =>
      Effect.gen(function* () {
        const initialCursor =
          request.cursor !== undefined ? yield* decodeCursor(request.cursor, request) : undefined
        const seed = initialCursor?.seed ?? Math.floor(Math.random() * 1_000_000) + 1
        const creatorParams = request.creatorId !== undefined ? [request.creatorId] : []
        const creatorFilter = creatorParams.length > 0
        const countRows = yield* sql
          .unsafe<CountRow>(
            `SELECT COUNT(*) AS total
          FROM videos AS v
          INNER JOIN channels AS c ON c.id = v.channel_id
          WHERE v.thumbnail_path <> ''
            AND c.avatar_path IS NOT NULL
            ${creatorFilter ? "AND v.channel_id = ?" : ""}`,
            creatorParams,
          )
          .pipe(
            Effect.mapError(
              (error) => new CatalogError({ operation: "count assets", message: String(error) }),
            ),
          )

        const assets: Array<{ readonly asset: Asset; readonly cursor: CursorPayload }> = []
        let cursor = initialCursor
        let exhausted = false
        const batchSize = Math.max(request.limit * 3, 60)

        while (assets.length <= request.limit && !exhausted) {
          const parts = sortParts(request.sort, cursor, seed)
          const params = [...parts.selectParams, ...creatorParams, ...parts.whereParams, batchSize]
          const rows = yield* sql
            .unsafe<AssetRow>(
              `SELECT
              v.id,
              v.title,
              v.channel_id,
              c.title AS channel_title,
              v.published_at,
              v.duration_seconds,
              v.view_count,
              v.thumbnail_path,
              c.avatar_path,
              ${parts.select} AS sort_value
            FROM videos AS v
            INNER JOIN channels AS c ON c.id = v.channel_id
            WHERE v.thumbnail_path <> ''
              AND c.avatar_path IS NOT NULL
              ${creatorFilter ? "AND v.channel_id = ?" : ""}
              ${parts.where}
            ORDER BY ${parts.order}
            LIMIT ?`,
              params,
            )
            .pipe(
              Effect.mapError(
                (error) => new CatalogError({ operation: "list assets", message: String(error) }),
              ),
            )

          exhausted = rows.length < batchSize

          for (const row of rows) {
            cursor = rowCursor(row, request, seed)
            const available = yield* fileIsAvailable(
              row.thumbnail_path,
              paths.thumbnailsDirectory,
              fs,
              path,
            )

            if (available) {
              assets.push({ asset: rowAsset(row), cursor })
              if (assets.length > request.limit) break
            }
          }
        }

        const hasMore = assets.length > request.limit
        const visible = assets.slice(0, request.limit)
        const lastVisible = visible.at(-1)
        const nextCursor = hasMore && lastVisible ? encodeCursor(lastVisible.cursor) : undefined

        return {
          items: visible.map(({ asset }) => asset),
          ...(nextCursor ? { nextCursor } : {}),
          total: countRows[0]?.total ?? 0,
        }
      })

    return AssetCatalog.of({ listCreators, listAssets })
  }),
)

export const LocalAssetMedia = Layer.effect(
  AssetMedia,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const paths = yield* ExplorerPaths

    const lookup = (
      id: string,
      query: string,
      directory: string,
    ): Effect.Effect<AssetMediaFile, MediaNotFoundError | MediaReadError> =>
      sql.unsafe<MediaPathRow>(query, [id]).pipe(
        Effect.mapError((error) => new MediaReadError({ id, message: String(error) })),
        Effect.flatMap((rows) => {
          const candidate = rows[0]?.path
          return candidate
            ? openMediaFile(id, candidate, directory, fs, path)
            : Effect.fail(new MediaNotFoundError({ id }))
        }),
      )

    return AssetMedia.of({
      getThumbnail: (id) =>
        lookup(
          id,
          "SELECT thumbnail_path AS path FROM videos WHERE id = ? LIMIT 1",
          paths.thumbnailsDirectory,
        ),
      getCreatorAvatar: (id) =>
        lookup(
          id,
          "SELECT avatar_path AS path FROM channels WHERE id = ? AND avatar_path IS NOT NULL LIMIT 1",
          paths.channelAvatarsDirectory,
        ),
    })
  }),
)

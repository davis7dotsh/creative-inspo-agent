import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { NodeServices } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { LocalAssetCatalog, LocalAssetMedia } from "../src/server/layers/local-asset-services.js"
import { AssetCatalog } from "../src/server/services/asset-catalog.js"
import { AssetMedia } from "../src/server/services/asset-media.js"
import { ExplorerPaths } from "../src/server/services/explorer-paths.js"

const roots: Array<string> = []

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "assets-explorer-test-"))
  roots.push(root)
  const thumbnails = join(root, "assets", "thumbnails")
  const avatars = join(root, "assets", "channel-avatars")
  mkdirSync(thumbnails, { recursive: true })
  mkdirSync(avatars, { recursive: true })

  const avatar = join(avatars, "creator-1.jpg")
  writeFileSync(avatar, "avatar")
  const databaseFile = join(root, "creative-agent.sqlite")
  const database = new DatabaseSync(databaseFile)
  database.exec(`
    CREATE TABLE channels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      avatar_path TEXT
    );
    CREATE TABLE videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_title TEXT NOT NULL,
      published_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      view_count INTEGER,
      thumbnail_path TEXT NOT NULL
    );
  `)
  database
    .prepare("INSERT INTO channels(id, title, avatar_path) VALUES (?, ?, ?)")
    .run("creator-1", "Fixture Creator", avatar)

  const insert = database.prepare(`
    INSERT INTO videos(
      id, title, channel_id, channel_title, published_at,
      duration_seconds, view_count, thumbnail_path
    ) VALUES (?, ?, 'creator-1', 'Stale Creator Title', ?, ?, ?, ?)
  `)

  for (let index = 1; index <= 7; index += 1) {
    const thumbnail = join(thumbnails, `video-${index}.jpg`)
    if (index !== 7) writeFileSync(thumbnail, `thumbnail-${index}`)
    insert.run(
      `video-${index}`,
      `Video ${index}`,
      `2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      index * 60,
      index * 1_000,
      thumbnail,
    )
  }
  database.close()

  const PathsLive = ExplorerPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
  const DatabaseLive = SqliteClient.layer({
    filename: databaseFile,
    readonly: true,
    disableWAL: true,
  })
  const ServicesLive = Layer.mergeAll(LocalAssetCatalog, LocalAssetMedia).pipe(
    Layer.provide(DatabaseLive),
    Layer.provide(PathsLive),
    Layer.provide(NodeServices.layer),
  )

  return { root, ServicesLive }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("local asset services", () => {
  it("lists normalized creators and hides missing thumbnails", async () => {
    const { ServicesLive } = makeFixture()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const catalog = yield* AssetCatalog
        const creators = yield* catalog.listCreators
        const page = yield* catalog.listAssets({ sort: "newest", limit: 10 })
        return { creators, page }
      }).pipe(Effect.provide(ServicesLive)),
    )

    expect(result.creators).toHaveLength(1)
    expect(result.creators[0]?.title).toBe("Fixture Creator")
    expect(result.page.items).toHaveLength(6)
    expect(result.page.items[0]?.id).toBe("video-6")
    expect(result.page.items.every((asset) => asset.creatorTitle === "Fixture Creator")).toBe(true)
  })

  it("paginates random order without duplicates", async () => {
    const { ServicesLive } = makeFixture()

    const ids = await Effect.runPromise(
      Effect.gen(function* () {
        const catalog = yield* AssetCatalog
        const first = yield* catalog.listAssets({ sort: "random", limit: 2 })
        if (!first.nextCursor) return yield* Effect.die("Expected a second page")
        const second = yield* catalog.listAssets({
          sort: "random",
          limit: 2,
          cursor: first.nextCursor,
        })
        if (!second.nextCursor) return yield* Effect.die("Expected a third page")
        const third = yield* catalog.listAssets({
          sort: "random",
          limit: 2,
          cursor: second.nextCursor,
        })
        return [...first.items, ...second.items, ...third.items].map((asset) => asset.id)
      }).pipe(Effect.provide(ServicesLive)),
    )

    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(6)
  })

  it("streams approved media and rejects unknown ids", async () => {
    const { ServicesLive } = makeFixture()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const media = yield* AssetMedia
        const file = yield* media.getThumbnail("video-1")
        const missing = yield* Effect.flip(media.getThumbnail("unknown"))
        return { file, missing }
      }).pipe(Effect.provide(ServicesLive)),
    )

    expect(result.file.contentType).toBe("image/jpeg")
    expect(result.file.contentLength).toBeGreaterThan(0)
    expect(result.missing._tag).toBe("MediaNotFoundError")
  })
})

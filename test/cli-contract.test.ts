import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { embedItems } from "../src/commands/embed.js"
import { reindexVideos, searchVideos } from "../src/commands/videos.js"
import type { Embedding } from "../src/domain/video.js"
import { EmbeddingClient } from "../src/services/embedding-client.js"
import {
  type StoredVideo,
  VideoLibrary,
  type VideoLibraryShape,
} from "../src/services/video-library.js"

const temporaryRoots: Array<string> = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

const runCli = (args: ReadonlyArray<string>, input?: string) => {
  const root = mkdtempSync(join(tmpdir(), "creative-agent-cli-"))
  temporaryRoots.push(root)
  return runCliAtRoot(root, args, input)
}

const runCliAtRoot = (root: string, args: ReadonlyArray<string>, input?: string) =>
  spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CREATIVE_AGENT_HOME: root },
    encoding: "utf8",
    input,
  })

const runCliAtRootAsync = (root: string, args: ReadonlyArray<string>, input?: string) =>
  new Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
        cwd: process.cwd(),
        env: { ...process.env, CREATIVE_AGENT_HOME: root },
        stdio: ["pipe", "pipe", "pipe"],
      })
      let stdout = ""
      let stderr = ""
      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk
      })
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk
      })
      child.on("error", reject)
      child.on("close", (status) => resolve({ status, stdout, stderr }))
      child.stdin.end(input)
    },
  )

const embedding = (values: ReadonlyArray<number>): Embedding => ({
  model: "text-embedding-3-large",
  dimensions: values.length,
  values,
})

const preparedVideoInput = (root: string, id: string, thumbnail = `thumbnail:${id}`) => {
  const localThumbnailPath = join(root, "staging", `${id}.jpg`)
  mkdirSync(join(root, "staging"), { recursive: true })
  writeFileSync(localThumbnailPath, thumbnail)
  const values = Array<number>(1536).fill(0)
  values[0] = 1
  const preparedEmbedding = {
    model: "text-embedding-3-large",
    dimensions: values.length,
    values,
  }
  return {
    id,
    title: `Video ${id}`,
    channelId: "channel-id",
    channelTitle: "Channel",
    publishedAt: "2026-01-01T00:00:00.000Z",
    durationSeconds: 240,
    thumbnails: [{ url: `https://example.com/${id}.jpg` }],
    localThumbnailPath,
    statistics: { viewCount: "1000" },
    thumbnailDescription: `Thumbnail ${id}`,
    titleEmbedding: preparedEmbedding,
    thumbnailDescriptionEmbedding: preparedEmbedding,
  }
}

const preparedChannelInput = (root: string, id: string, avatar = `avatar:${id}`) => {
  const localAvatarPath = join(root, "staging", `${id}-avatar.jpg`)
  mkdirSync(join(root, "staging"), { recursive: true })
  writeFileSync(localAvatarPath, avatar)
  return {
    id,
    title: `Channel ${id}`,
    avatars: [
      { url: `https://example.com/${id}-default.jpg`, width: 88, height: 88 },
      { url: `https://example.com/${id}-high.jpg`, width: 800, height: 800 },
    ],
    localAvatarPath,
  }
}

const storedVideo = (id: string): StoredVideo => ({
  id,
  title: `Title ${id}`,
  channelId: "channel-id",
  channelTitle: "Channel",
  publishedAt: "2026-01-01T00:00:00.000Z",
  durationSeconds: 240,
  thumbnails: [{ url: `https://example.com/${id}.jpg` }],
  localThumbnailPath: `/tmp/${id}.jpg`,
  statistics: { viewCount: "1000" },
  thumbnailDescription: `Thumbnail ${id}`,
  embeddingModel: "text-embedding-3-large",
  embeddingDimensions: 1536,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

const unused = Effect.die("unused test service method")

describe("CLI process contract", () => {
  it("shows help without initializing application storage", () => {
    const root = mkdtempSync(join(tmpdir(), "creative-agent-cli-"))
    temporaryRoots.push(root)
    const blocker = join(root, "not-a-directory")
    writeFileSync(blocker, "blocked")

    const result = runCliAtRoot(join(blocker, "home"), ["--help"])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Collect and search YouTube inspiration")
  })

  it("checks auth status without loading malformed application config", () => {
    const root = mkdtempSync(join(tmpdir(), "creative-agent-cli-"))
    temporaryRoots.push(root)
    writeFileSync(join(root, "config.json"), "not json\n", { mode: 0o600 })

    const result = runCliAtRoot(root, ["auth", "status"])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: { authenticated: false },
    })
  })

  it("prints one JSON success envelope on stdout", () => {
    const result = runCli(["status"])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: { version: "0.1.0" },
    })
  })

  it("prints machine-readable JSON stdin contracts", () => {
    const result = runCli(["schema", "videos-search"])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        command: "creative-agent videos search",
        input: "stdin",
        schema: {
          dialect: "draft-2020-12",
          schema: { anyOf: expect.any(Array) },
        },
      },
    })
  })

  it("publishes channel-avatar fields in both ingestion schemas", () => {
    const channelSchema = runCli(["schema", "channels-upsert"])
    const videoSchema = runCli(["schema", "videos-upsert"])

    expect(channelSchema.status).toBe(0)
    expect(channelSchema.stderr).toBe("")
    expect(JSON.parse(channelSchema.stdout)).toMatchObject({
      ok: true,
      data: {
        command: "creative-agent channels upsert",
        schema: {
          schema: {
            properties: {
              channels: {
                items: {
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    avatars: { type: "array" },
                    localAvatarPath: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    })
    expect(videoSchema.status).toBe(0)
    expect(videoSchema.stderr).toBe("")
    expect(JSON.parse(videoSchema.stdout).data.schema.schema.properties.channels.type).toBe("array")
  })

  it("prints safe JSON failures on stderr and exits nonzero", () => {
    const result = runCli(["embed"], "not-json")

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Embedding input JSON is invalid",
      },
    })
    expect(result.stderr).not.toContain("SchemaError")
  })

  it("does not leak database causes for missing videos", () => {
    const result = runCli(["videos", "show", "missing"])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { code: "not_found", message: "video missing was not found" },
    })
    expect(result.stderr).not.toContain("sqlite")
  })

  it("decodes JSON stdin for atomic upsert and keyword search", () => {
    const root = mkdtempSync(join(tmpdir(), "creative-agent-cli-"))
    temporaryRoots.push(root)
    const runAtRoot = (args: ReadonlyArray<string>, input: string) =>
      spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
        cwd: process.cwd(),
        env: { ...process.env, CREATIVE_AGENT_HOME: root },
        encoding: "utf8",
        input,
      })

    const upsert = runAtRoot(["videos", "upsert"], JSON.stringify({ videos: [] }))
    const search = runAtRoot(
      ["videos", "search"],
      JSON.stringify({ mode: "keyword", query: "camera" }),
    )

    expect(upsert.status).toBe(0)
    expect(JSON.parse(upsert.stdout)).toEqual({
      ok: true,
      data: { total: 0, inserted: 0, updated: 0 },
    })
    expect(search.status).toBe(0)
    expect(JSON.parse(search.stdout)).toEqual({ ok: true, data: { results: [] } })
  })

  it("atomically upserts and lists retained channel avatars", () => {
    const root = mkdtempSync(join(tmpdir(), "creative-agent-cli-"))
    temporaryRoots.push(root)
    const channel = preparedChannelInput(root, "creator")

    const upsert = runCliAtRoot(
      root,
      ["channels", "upsert"],
      JSON.stringify({ channels: [channel] }),
    )
    const list = runCliAtRoot(root, ["channels", "list"])

    expect(upsert.status).toBe(0)
    expect(JSON.parse(upsert.stdout)).toEqual({
      ok: true,
      data: { total: 1, inserted: 1, updated: 0 },
    })
    expect(list.status).toBe(0)
    expect(JSON.parse(list.stdout).data.channels).toMatchObject([
      {
        id: "creator",
        title: "Channel creator",
        avatars: channel.avatars,
        localAvatarPath: expect.stringMatching(/assets\/channel-avatars\/[a-f0-9]{64}\.jpg$/),
      },
    ])
  })

  it("rejects videos under 180 seconds and accepts the exact boundary", () => {
    const root = mkdtempSync(join(tmpdir(), "creative-agent-cli-"))
    temporaryRoots.push(root)
    const short = { ...preparedVideoInput(root, "short"), durationSeconds: 179 }
    const boundary = { ...preparedVideoInput(root, "boundary"), durationSeconds: 180 }

    const rejected = runCliAtRoot(root, ["videos", "upsert"], JSON.stringify({ videos: [short] }))
    const accepted = runCliAtRoot(
      root,
      ["videos", "upsert"],
      JSON.stringify({ videos: [boundary] }),
    )
    const listed = runCliAtRoot(root, ["videos", "list"])

    expect(rejected.status).toBe(1)
    expect(JSON.parse(rejected.stderr)).toEqual({
      ok: false,
      error: { code: "validation_error", message: "Prepared video batch JSON is invalid" },
    })
    expect(accepted.status).toBe(0)
    expect(JSON.parse(accepted.stdout)).toEqual({
      ok: true,
      data: { total: 1, inserted: 1, updated: 0 },
    })
    expect(
      JSON.parse(listed.stdout).data.videos.map(({ id }: { readonly id: string }) => id),
    ).toEqual(["boundary"])
  })

  it("does not partially apply a multi-id delete when one id is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "creative-agent-cli-"))
    temporaryRoots.push(root)
    const videos = [preparedVideoInput(root, "first"), preparedVideoInput(root, "second")]
    const upsert = runCliAtRoot(root, ["videos", "upsert"], JSON.stringify({ videos }))
    expect(upsert.status).toBe(0)

    const deletion = runCliAtRoot(root, ["videos", "delete", "first", "missing"])
    const list = runCliAtRoot(root, ["videos", "list"])

    expect(deletion.status).toBe(1)
    expect(JSON.parse(deletion.stderr)).toEqual({
      ok: false,
      error: { code: "not_found", message: "video missing was not found" },
    })
    expect(list.status).toBe(0)
    expect(
      JSON.parse(list.stdout)
        .data.videos.map((video: { readonly id: string }) => video.id)
        .sort(),
    ).toEqual(["first", "second"])
  })

  it("keeps thumbnail files consistent across concurrent writer processes", async () => {
    const root = mkdtempSync(join(tmpdir(), "creative-agent-cli-"))
    temporaryRoots.push(root)
    const sharedThumbnail = "shared thumbnail bytes"
    const original = preparedVideoInput(root, "original", sharedThumbnail)
    expect(
      runCliAtRoot(root, ["videos", "upsert"], JSON.stringify({ videos: [original] })).status,
    ).toBe(0)

    const incoming = preparedVideoInput(root, "incoming", sharedThumbnail)
    const results = await Promise.all([
      runCliAtRootAsync(root, ["videos", "delete", original.id]),
      runCliAtRootAsync(root, ["videos", "upsert"], JSON.stringify({ videos: [incoming] })),
    ])
    expect(results.every(({ status }) => status === 0 || status === 1)).toBe(true)

    const list = runCliAtRoot(root, ["videos", "list"])
    expect(list.status).toBe(0)
    const videos = JSON.parse(list.stdout).data.videos as ReadonlyArray<{
      readonly localThumbnailPath: string
    }>
    const referenced = videos.map(({ localThumbnailPath }) => localThumbnailPath).sort()
    const assets = readdirSync(join(root, "assets", "thumbnails"))
      .map((entry) => join(root, "assets", "thumbnails", entry))
      .sort()
    expect(assets).toEqual([...new Set(referenced)])
  })
})

describe("command orchestration", () => {
  it("preserves input ids when embedding JSON items", async () => {
    const layer = EmbeddingClient.layerFrom({
      embed: (inputs) => Effect.succeed(inputs.map((_, index) => embedding([index, 1]))),
    })
    const result = await Effect.runPromise(
      embedItems({
        inputs: [
          { id: "title", text: "A title" },
          { id: "thumbnail", text: "A thumbnail" },
        ],
      }).pipe(Effect.provide(layer)),
    )

    expect(result.items.map(({ id }) => id)).toEqual(["title", "thumbnail"])
    expect(result.items[1]?.embedding?.values).toEqual([1, 1])
  })

  it("embeds semantic query text and forwards filters to the library", async () => {
    const requests: Array<unknown> = []
    const library: VideoLibraryShape = {
      upsertPreparedBatch: () => unused,
      searchSemantic: (request) => {
        requests.push(request)
        return Effect.succeed([])
      },
      searchKeyword: () => unused,
      list: () => unused,
      show: () => unused,
      delete: () => unused,
      deleteMany: () => unused,
      replaceEmbeddings: () => unused,
      upsertPreparedChannels: () => unused,
      listChannels: unused,
      showChannel: () => unused,
    }
    const layer = Layer.merge(
      Layer.succeed(VideoLibrary)(library),
      EmbeddingClient.layerFrom({
        embed: () => Effect.succeed([embedding([1, 0, 0])]),
      }),
    )

    await Effect.runPromise(
      searchVideos({
        mode: "semantic",
        signal: "thumbnailDescription",
        query: "ranking thumbnails",
        limit: 12,
        filters: { channel: "Studio", minViewCount: 1000 },
      }).pipe(Effect.provide(layer)),
    )

    expect(requests).toEqual([
      {
        signal: "thumbnailDescription",
        embedding: [1, 0, 0],
        model: "text-embedding-3-large",
        limit: 12,
        filters: { channel: "Studio", minViewCount: 1000 },
      },
    ])
  })

  it("prepares every reindex embedding before one atomic replacement", async () => {
    const videos = [storedVideo("one"), storedVideo("two")]
    const embeddingInputs: Array<ReadonlyArray<string>> = []
    const replacements: Array<unknown> = []
    const library: VideoLibraryShape = {
      upsertPreparedBatch: () => unused,
      searchSemantic: () => unused,
      searchKeyword: () => unused,
      list: ({ offset = 0 } = {}) => Effect.succeed(videos.slice(offset, offset + 200)),
      show: () => unused,
      delete: () => unused,
      deleteMany: () => unused,
      replaceEmbeddings: (batch) => {
        replacements.push(batch)
        return Effect.void
      },
      upsertPreparedChannels: () => unused,
      listChannels: unused,
      showChannel: () => unused,
    }
    const layer = Layer.merge(
      Layer.succeed(VideoLibrary)(library),
      EmbeddingClient.layerFrom({
        embed: (inputs) => {
          embeddingInputs.push(inputs)
          return Effect.succeed(inputs.map((_, index) => embedding([index, 1])))
        },
      }),
    )

    const result = await Effect.runPromise(reindexVideos.pipe(Effect.provide(layer)))

    expect(result).toEqual({ reindexed: 2 })
    expect(embeddingInputs).toEqual([["Title one", "Thumbnail one", "Title two", "Thumbnail two"]])
    expect(replacements).toHaveLength(1)
    expect(replacements[0]).toMatchObject({
      videos: [{ id: "one" }, { id: "two" }],
    })
  })
})

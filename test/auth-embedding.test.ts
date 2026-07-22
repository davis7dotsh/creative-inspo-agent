import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Redacted } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"
import { embedTexts } from "../src/commands/embed.js"
import { AppConfig } from "../src/services/app-config.js"
import { AppPaths } from "../src/services/app-paths.js"
import { AuthStore } from "../src/services/auth-store.js"
import { EmbeddingClient } from "../src/services/embedding-client.js"

const appConfig = {
  embeddingModel: "text-embedding-3-large",
  embeddingDimensions: 3,
  thumbnailDescriptionModel: "gpt-5.6-luna",
}

const authLayer = AuthStore.layerFrom({
  login: () => Effect.succeed({ authenticated: true }),
  logout: Effect.succeed({ authenticated: false }),
  status: Effect.succeed({ authenticated: true }),
  apiKey: Effect.succeed(Redacted.make("test-secret", { label: "OPENAI_API_KEY" })),
})

const embeddingLayerWith = (
  handler: (request: HttpClientRequest.HttpClientRequest) => Response,
) => {
  const http = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))),
  )
  const dependencies = Layer.mergeAll(
    authLayer,
    AppConfig.layerFrom(appConfig),
    Layer.succeed(HttpClient.HttpClient)(http),
  )

  return EmbeddingClient.layer.pipe(Layer.provide(dependencies))
}

describe("AuthStore", () => {
  it("atomically stores a redacted key with owner-only permissions", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-auth-test-" })
        const pathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
        const dependencies = Layer.merge(NodeServices.layer, pathsLayer)
        const storeLayer = AuthStore.layer.pipe(Layer.provide(dependencies))

        return yield* Effect.gen(function* () {
          const auth = yield* AuthStore
          const before = yield* auth.status
          const login = yield* auth.login(
            Redacted.make("  test-secret  ", { label: "OPENAI_API_KEY" }),
          )
          const key = yield* auth.apiKey
          const info = yield* fs.stat(`${root}/auth.json`)
          const contents = yield* fs.readFileString(`${root}/auth.json`)
          const status = yield* auth.status
          const logout = yield* auth.logout
          const existsAfterLogout = yield* fs.exists(`${root}/auth.json`)

          return {
            before,
            login,
            key,
            mode: info.mode & 0o777,
            contents,
            status,
            logout,
            existsAfterLogout,
          }
        }).pipe(Effect.provide(storeLayer))
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )

    expect(result.before).toEqual({ authenticated: false })
    expect(result.login).toEqual({ authenticated: true })
    expect(result.status).toEqual({ authenticated: true })
    expect(result.logout).toEqual({ authenticated: false })
    expect(result.existsAfterLogout).toBe(false)
    expect(result.mode).toBe(0o600)
    expect(result.contents).toContain("test-secret")
    expect(String(result.key)).toBe("<redacted:OPENAI_API_KEY>")
    expect(JSON.stringify(result.key)).not.toContain("test-secret")
  })

  it("rejects an empty key without creating auth.json", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-auth-test-" })
        const pathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
        const dependencies = Layer.merge(NodeServices.layer, pathsLayer)
        const storeLayer = AuthStore.layer.pipe(Layer.provide(dependencies))
        const error = yield* Effect.gen(function* () {
          const auth = yield* AuthStore
          return yield* auth.login(Redacted.make("   ")).pipe(Effect.flip)
        }).pipe(Effect.provide(storeLayer))

        return { error, exists: yield* fs.exists(`${root}/auth.json`) }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )

    expect(result.error._tag).toBe("AuthenticationError")
    expect(result.error.message).not.toContain("   ")
    expect(result.exists).toBe(false)
  })
})

describe("AppConfig", () => {
  it("loads the initialized defaults through its live layer", async () => {
    const config = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-config-test-" })
        const pathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
        const dependencies = Layer.merge(NodeServices.layer, pathsLayer)
        const configLayer = AppConfig.layer.pipe(Layer.provide(dependencies))

        return yield* AppConfig.pipe(Effect.provide(configLayer))
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )

    expect(config).toEqual({
      embeddingModel: "text-embedding-3-large",
      embeddingDimensions: 1536,
      thumbnailDescriptionModel: "gpt-5.6-luna",
    })
  })

  it("reports malformed configuration without reflecting its contents", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-config-test-" })
        yield* fs.writeFileString(`${root}/config.json`, '{"embeddingModel":"private-value"}')
        const pathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
        const dependencies = Layer.merge(NodeServices.layer, pathsLayer)
        const configLayer = AppConfig.layer.pipe(Layer.provide(dependencies))

        return yield* AppConfig.pipe(Effect.provide(configLayer), Effect.flip)
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )

    expect(error).toMatchObject({
      _tag: "ConfigurationError",
      message: "The Creative Agent configuration is invalid",
    })
    expect(error.message).not.toContain("private-value")
  })

  it("rejects embedding dimensions other than the v1 vector width", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "creative-agent-config-test-" })
        yield* fs.writeFileString(
          `${root}/config.json`,
          JSON.stringify({
            embeddingModel: "text-embedding-3-large",
            embeddingDimensions: 3,
            thumbnailDescriptionModel: "gpt-5.6-luna",
          }),
        )
        const pathsLayer = AppPaths.layerFor(root).pipe(Layer.provide(NodeServices.layer))
        const dependencies = Layer.merge(NodeServices.layer, pathsLayer)
        const configLayer = AppConfig.layer.pipe(Layer.provide(dependencies))

        return yield* AppConfig.pipe(Effect.provide(configLayer), Effect.flip)
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )

    expect(error).toMatchObject({
      _tag: "ConfigurationError",
      message: "The Creative Agent configuration is invalid",
    })
  })
})

describe("EmbeddingClient", () => {
  it("sends a redacted bearer key and decodes ordered embeddings", async () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = []
    const layer = embeddingLayerWith((request) => {
      requests.push(request)
      return new Response(
        JSON.stringify({
          object: "list",
          model: "text-embedding-3-large",
          data: [
            { object: "embedding", index: 1, embedding: [4, 5, 6] },
            { object: "embedding", index: 0, embedding: [1, 2, 3] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })

    const embeddings = await Effect.runPromise(
      embedTexts(["first", "second"]).pipe(Effect.provide(layer)),
    )

    expect(embeddings).toEqual([
      { model: "text-embedding-3-large", dimensions: 3, values: [1, 2, 3] },
      { model: "text-embedding-3-large", dimensions: 3, values: [4, 5, 6] },
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe("Bearer test-secret")
    const body = requests[0]?.body
    expect(body?._tag).toBe("Uint8Array")
    if (body?._tag !== "Uint8Array") {
      throw new Error("expected a JSON request body")
    }
    expect(JSON.parse(new TextDecoder().decode(body.body))).toEqual({
      model: "text-embedding-3-large",
      input: ["first", "second"],
      dimensions: 3,
      encoding_format: "float",
    })
  })

  it("returns a stable typed error for HTTP failures", async () => {
    const layer = embeddingLayerWith(
      () =>
        new Response(JSON.stringify({ error: { message: "sensitive provider detail" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    )

    const error = await Effect.runPromise(
      embedTexts(["hello"]).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error).toMatchObject({
      _tag: "OpenAIError",
      operation: "create embeddings",
      message: "The OpenAI embeddings request failed",
    })
    expect(error.message).not.toContain("sensitive provider detail")
  })

  it("rejects malformed or wrong-sized embedding responses", async () => {
    const malformedLayer = embeddingLayerWith(
      () =>
        new Response(JSON.stringify({ object: "not-a-list" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    const wrongSizeLayer = embeddingLayerWith(
      () =>
        new Response(
          JSON.stringify({
            object: "list",
            model: "text-embedding-3-large",
            data: [{ object: "embedding", index: 0, embedding: [1, 2] }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )

    const malformed = await Effect.runPromise(
      embedTexts(["hello"]).pipe(Effect.provide(malformedLayer), Effect.flip),
    )
    const wrongSize = await Effect.runPromise(
      embedTexts(["hello"]).pipe(Effect.provide(wrongSizeLayer), Effect.flip),
    )

    expect(malformed).toMatchObject({
      _tag: "OpenAIError",
      message: "The OpenAI embeddings request failed",
    })
    expect(wrongSize).toMatchObject({
      _tag: "OpenAIError",
      message: "OpenAI returned an invalid embeddings response",
    })
  })
})

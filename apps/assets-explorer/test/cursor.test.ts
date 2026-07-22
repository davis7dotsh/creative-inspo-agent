import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { decodeCursor, encodeCursor } from "../src/server/domain/cursor.js"

describe("asset cursors", () => {
  it("round-trips a random cursor with its seed", async () => {
    const encoded = encodeCursor({
      version: 1,
      sort: "random",
      creatorId: "creator-1",
      value: 42,
      id: "video-1",
      seed: 8128,
    })

    const decoded = await Effect.runPromise(
      decodeCursor(encoded, { sort: "random", creatorId: "creator-1" }),
    )

    expect(decoded).toEqual({
      version: 1,
      sort: "random",
      creatorId: "creator-1",
      value: 42,
      id: "video-1",
      seed: 8128,
    })
  })

  it("rejects cursors reused with a different filter", async () => {
    const encoded = encodeCursor({
      version: 1,
      sort: "newest",
      creatorId: null,
      value: "2026-01-01T00:00:00.000Z",
      id: "video-1",
    })

    const result = await Effect.runPromiseExit(decodeCursor(encoded, { sort: "oldest" }))

    expect(result._tag).toBe("Failure")
  })

  it("rejects malformed payloads", async () => {
    const result = await Effect.runPromiseExit(decodeCursor("not-a-cursor", { sort: "random" }))

    expect(result._tag).toBe("Failure")
  })
})

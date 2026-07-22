import { Effect, Schema } from "effect"
import type { SortOrder } from "../../contracts/api.js"
import { InvalidCursorError } from "./errors.js"

const CursorPayload = Schema.Struct({
  version: Schema.Literal(1),
  sort: Schema.Literals(["random", "newest", "oldest", "mostViewed"]),
  creatorId: Schema.NullOr(Schema.String),
  value: Schema.Union([Schema.String, Schema.Finite]),
  id: Schema.String,
  seed: Schema.optionalKey(Schema.Int),
})

export type CursorPayload = typeof CursorPayload.Type

const decodePayload = Schema.decodeUnknownEffect(CursorPayload)

export const encodeCursor = (cursor: CursorPayload) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

export const decodeCursor = (
  encoded: string,
  expected: { readonly sort: SortOrder; readonly creatorId?: string },
) =>
  Effect.try({
    try: () => JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    catch: () => new InvalidCursorError({ message: "The cursor is malformed." }),
  }).pipe(
    Effect.flatMap(decodePayload),
    Effect.mapError(() => new InvalidCursorError({ message: "The cursor is invalid." })),
    Effect.filterOrFail(
      (cursor) =>
        cursor.sort === expected.sort && cursor.creatorId === (expected.creatorId ?? null),
      () => new InvalidCursorError({ message: "The cursor does not match these filters." }),
    ),
    Effect.filterOrFail(
      (cursor) => cursor.sort !== "random" || cursor.seed !== undefined,
      () => new InvalidCursorError({ message: "The random cursor is missing its seed." }),
    ),
  )

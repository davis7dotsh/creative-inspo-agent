import { Effect, Schema } from "effect"
import { SortOrder } from "../../contracts/api.js"
import { InvalidCursorError } from "./errors.js"

const CursorPayload = Schema.Struct({
  version: Schema.Literal(1),
  sort: SortOrder,
  creatorId: Schema.NullOr(Schema.String),
  value: Schema.Union([Schema.String, Schema.Finite]),
  id: Schema.String,
  seed: Schema.optionalKey(Schema.Int),
})

export type CursorPayload = typeof CursorPayload.Type

const valueMatchesSort = (cursor: CursorPayload) =>
  cursor.sort === "newest" || cursor.sort === "oldest"
    ? typeof cursor.value === "string"
    : typeof cursor.value === "number"

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
    Effect.filterOrFail(
      valueMatchesSort,
      () => new InvalidCursorError({ message: "The cursor value does not match its sort order." }),
    ),
  )

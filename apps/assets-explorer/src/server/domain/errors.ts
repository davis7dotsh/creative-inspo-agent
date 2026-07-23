import { Schema } from "effect"

export class CatalogError extends Schema.TaggedErrorClass<CatalogError>()("CatalogError", {
  operation: Schema.String,
  message: Schema.String,
}) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "InvalidCursorError",
  { message: Schema.String },
) {}

export class MediaNotFoundError extends Schema.TaggedErrorClass<MediaNotFoundError>()(
  "MediaNotFoundError",
  { id: Schema.String },
) {}

export class MediaReadError extends Schema.TaggedErrorClass<MediaReadError>()("MediaReadError", {
  id: Schema.String,
  message: Schema.String,
}) {}

import { Schema } from "effect"

export class ConfigurationError extends Schema.TaggedErrorClass<ConfigurationError>()(
  "ConfigurationError",
  {
    message: Schema.String,
  },
) {}

export class StorageError extends Schema.TaggedErrorClass<StorageError>()("StorageError", {
  operation: Schema.String,
  message: Schema.String,
}) {}

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>()("ValidationError", {
  message: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("NotFoundError", {
  resource: Schema.String,
  id: Schema.String,
}) {}

export class AuthenticationError extends Schema.TaggedErrorClass<AuthenticationError>()(
  "AuthenticationError",
  {
    message: Schema.String,
  },
) {}

export class OpenAIError extends Schema.TaggedErrorClass<OpenAIError>()("OpenAIError", {
  operation: Schema.String,
  message: Schema.String,
}) {}

export type AppError =
  | ConfigurationError
  | StorageError
  | ValidationError
  | NotFoundError
  | AuthenticationError
  | OpenAIError

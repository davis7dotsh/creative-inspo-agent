import { Console, Schema } from "effect"
import { CliError } from "effect/unstable/cli"
import {
  AuthenticationError,
  ConfigurationError,
  NotFoundError,
  OpenAIError,
  StorageError,
  ValidationError,
} from "./domain/errors.js"

export const OutputError = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  details: Schema.optionalKey(Schema.Json),
})

export const SuccessEnvelope = <S extends Schema.Top>(data: S) =>
  Schema.Struct({
    ok: Schema.Literal(true),
    data,
  })

export const FailureEnvelope = Schema.Struct({
  ok: Schema.Literal(false),
  error: OutputError,
})

export type OutputError = typeof OutputError.Type

export const success = <Data>(data: Data) => ({ ok: true as const, data })

export const failure = (error: OutputError) => ({ ok: false as const, error })

export const writeOutput = (output: ReturnType<typeof success> | ReturnType<typeof failure>) =>
  Console.log(JSON.stringify(output))

export const writeFailure = (error: OutputError) => Console.error(JSON.stringify(failure(error)))

export const toPublicError = (error: unknown): OutputError => {
  if (error instanceof ConfigurationError) {
    return { code: "configuration_error", message: error.message }
  }
  if (error instanceof StorageError) {
    return {
      code: "storage_error",
      message: `Local storage operation failed: ${error.operation}`,
    }
  }
  if (error instanceof ValidationError) {
    return { code: "validation_error", message: error.message }
  }
  if (error instanceof NotFoundError) {
    return {
      code: "not_found",
      message: `${error.resource} ${error.id} was not found`,
    }
  }
  if (error instanceof AuthenticationError) {
    return { code: "authentication_error", message: error.message }
  }
  if (error instanceof OpenAIError) {
    return { code: "openai_error", message: error.message }
  }
  if (CliError.isCliError(error)) {
    return { code: "cli_error", message: "The command line input is invalid" }
  }
  return { code: "internal_error", message: "Creative Agent encountered an unexpected error" }
}

export const renderTable = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
) => {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column]?.length ?? 0)),
  )
  const renderRow = (row: ReadonlyArray<string>) =>
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? cell.length))
      .join("  ")
      .trimEnd()
  const separator = widths.map((width) => "-".repeat(width)).join("  ")
  return [renderRow(headers), separator, ...rows.map(renderRow)].join("\n")
}

export const writeTable = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
) => Console.log(renderTable(headers, rows))

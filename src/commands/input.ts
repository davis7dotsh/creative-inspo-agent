import { Effect, Schema, Stdio, Stream } from "effect"
import { ValidationError } from "../domain/errors.js"

export const readJsonInput = <S extends Schema.Top>(schema: S, label: string) =>
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio
    const chunks = yield* stdio.stdin.pipe(Stream.decodeText(), Stream.runCollect)
    const input = chunks.join("")
    if (input.trim().length === 0) {
      return yield* new ValidationError({ message: `${label} JSON is required on stdin` })
    }
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(input).pipe(
      Effect.mapError(() => new ValidationError({ message: `${label} JSON is invalid` })),
    )
  })

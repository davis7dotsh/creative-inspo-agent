import { Context, Effect, FileSystem, Layer, Option, Random, Redacted, Schema } from "effect"
import { AuthenticationError, StorageError } from "../domain/errors.js"
import { AppPaths, initializeAppPaths } from "./app-paths.js"

const AuthFile = Schema.Struct({
  openaiApiKey: Schema.String,
})

const decodeAuthFile = Schema.decodeUnknownEffect(Schema.fromJsonString(AuthFile))

export type AuthStatus = {
  readonly authenticated: boolean
}

export type AuthStoreShape = {
  readonly login: (
    apiKey: Redacted.Redacted<string>,
  ) => Effect.Effect<AuthStatus, AuthenticationError | StorageError>
  readonly logout: Effect.Effect<AuthStatus, StorageError>
  readonly status: Effect.Effect<AuthStatus, AuthenticationError | StorageError>
  /** For trusted service boundaries only. Never print or serialize the returned value. */
  readonly apiKey: Effect.Effect<Redacted.Redacted<string>, AuthenticationError | StorageError>
}

const invalidCredentials = () =>
  new AuthenticationError({
    message: "OpenAI credentials are missing or invalid; run `creative-agent auth login`",
  })

const storageFailure = (operation: string) =>
  new StorageError({
    operation,
    message: `Could not ${operation}`,
  })

const makeAuthStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* AppPaths
  yield* initializeAppPaths

  const read = Effect.fn("AuthStore.read")(function* () {
    const exists = yield* fs
      .exists(paths.authFile)
      .pipe(Effect.mapError(() => storageFailure("inspect OpenAI credentials")))
    if (!exists) {
      return Option.none<Redacted.Redacted<string>>()
    }

    const contents = yield* fs
      .readFileString(paths.authFile)
      .pipe(Effect.mapError(() => storageFailure("read OpenAI credentials")))
    const auth = yield* decodeAuthFile(contents).pipe(Effect.mapError(invalidCredentials))
    if (auth.openaiApiKey.trim().length === 0) {
      return yield* invalidCredentials()
    }

    return Option.some(Redacted.make(auth.openaiApiKey, { label: "OPENAI_API_KEY" }))
  })

  const login = Effect.fn("AuthStore.login")(function* (apiKey: Redacted.Redacted<string>) {
    const value = Redacted.value(apiKey).trim()
    if (value.length === 0) {
      return yield* invalidCredentials()
    }

    const suffix = Math.abs(yield* Random.nextInt)
    const temporaryFile = `${paths.authFile}.${suffix}.tmp`
    const contents = `${JSON.stringify({ openaiApiKey: value }, null, 2)}\n`
    const write = Effect.gen(function* () {
      yield* fs.writeFileString(temporaryFile, contents, { mode: 0o600 })
      yield* fs.chmod(temporaryFile, 0o600)
      yield* fs.rename(temporaryFile, paths.authFile)
    }).pipe(
      Effect.ensuring(fs.remove(temporaryFile, { force: true }).pipe(Effect.ignore)),
      Effect.mapError(() => storageFailure("save OpenAI credentials")),
    )

    yield* write
    return { authenticated: true }
  })

  const logout = fs.remove(paths.authFile, { force: true }).pipe(
    Effect.as({ authenticated: false }),
    Effect.mapError(() => storageFailure("remove OpenAI credentials")),
  )

  const status = read().pipe(Effect.map((key) => ({ authenticated: Option.isSome(key) })))

  const apiKey = read().pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(invalidCredentials()),
        onSome: Effect.succeed,
      }),
    ),
  )

  return AuthStore.of({ login, logout, status, apiKey })
})

export class AuthStore extends Context.Service<AuthStore, AuthStoreShape>()(
  "creative-agent/AuthStore",
) {
  static readonly layer = Layer.effect(this, makeAuthStore)

  static readonly layerFrom = (store: AuthStoreShape) => Layer.succeed(this)(store)
}

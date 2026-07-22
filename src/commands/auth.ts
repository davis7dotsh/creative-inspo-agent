import { Effect, type Redacted } from "effect"
import { Command, Prompt } from "effect/unstable/cli"
import { AuthLive } from "../live-layers.js"
import { success, writeOutput } from "../output.js"
import { AuthStore } from "../services/auth-store.js"

export const getAuthStatus = Effect.gen(function* () {
  const auth = yield* AuthStore
  return yield* auth.status
})

export const loginWithApiKey = Effect.fn("auth.login")(function* (
  apiKey: Redacted.Redacted<string>,
) {
  const auth = yield* AuthStore
  return yield* auth.login(apiKey)
})

export const logout = Effect.gen(function* () {
  const auth = yield* AuthStore
  return yield* auth.logout
})

const loginCommand = Command.make("login", {}, () =>
  Effect.gen(function* () {
    const apiKey = yield* Prompt.run(Prompt.password({ message: "OpenAI API key" }))
    const status = yield* loginWithApiKey(apiKey)
    yield* writeOutput(success(status))
  }).pipe(Effect.provide(AuthLive)),
).pipe(Command.withDescription("Save an OpenAI API key securely"))

const logoutCommand = Command.make("logout", {}, () =>
  logout.pipe(
    Effect.flatMap((status) => writeOutput(success(status))),
    Effect.provide(AuthLive),
  ),
).pipe(Command.withDescription("Remove the saved OpenAI API key"))

const statusCommand = Command.make("status", {}, () =>
  getAuthStatus.pipe(
    Effect.flatMap((status) => writeOutput(success(status))),
    Effect.provide(AuthLive),
  ),
).pipe(Command.withDescription("Check whether OpenAI authentication is stored locally"))

export const authCommand = Command.make("auth").pipe(
  Command.withDescription("Manage OpenAI authentication"),
  Command.withSubcommands([loginCommand, logoutCommand, statusCommand]),
)

#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Cause, Effect } from "effect"
import { program } from "./app.js"
import { toPublicError, writeFailure } from "./output.js"

program.pipe(
  Effect.provide(NodeServices.layer),
  Effect.matchCauseEffect({
    onFailure: (cause) =>
      writeFailure(toPublicError(Cause.squash(cause))).pipe(
        Effect.andThen(Effect.failCause(cause)),
      ),
    onSuccess: () => Effect.void,
  }),
  NodeRuntime.runMain({ disableErrorReporting: true }),
)

import { Command } from "effect/unstable/cli"
import { authCommand } from "./commands/auth.js"
import { embedCommand } from "./commands/embed.js"
import { schemaCommand } from "./commands/schema.js"
import { statusCommand } from "./commands/status.js"
import { videosCommand } from "./commands/videos.js"

export const rootCommand = Command.make("creative-agent").pipe(
  Command.withDescription("Collect and search YouTube inspiration"),
  Command.withSubcommands([statusCommand, authCommand, schemaCommand, embedCommand, videosCommand]),
)

export const program = Command.run(rootCommand, { version: "0.1.0" })

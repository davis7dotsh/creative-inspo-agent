import { execFileSync } from "node:child_process"
import { chmodSync, statSync } from "node:fs"
import { createRequire } from "node:module"

if (process.platform !== "win32") {
  const require = createRequire(import.meta.url)
  const launcher = require.resolve("@effect/tsgo/dist/effect-tsgo.js")
  const executable = execFileSync(process.execPath, [launcher, "get-exe-path"], {
    encoding: "utf8",
  }).trim()
  const mode = statSync(executable).mode

  if ((mode & 0o111) !== 0o111) {
    chmodSync(executable, mode | 0o111)
  }
}

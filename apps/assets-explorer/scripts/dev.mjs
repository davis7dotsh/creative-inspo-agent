import { spawn } from "node:child_process"

const children = [
  spawn("pnpm", ["dev:api"], { stdio: "inherit" }),
  spawn("pnpm", ["dev:web"], { stdio: "inherit" }),
]

let stopping = false

const stop = (signal) => {
  if (stopping) return false
  stopping = true
  for (const child of children) child.kill(signal)
  return true
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal))
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    const initiated = stop("SIGTERM")
    if (!initiated) return
    if (signal) process.kill(process.pid, signal)
    process.exitCode = code ?? 1
  })
}

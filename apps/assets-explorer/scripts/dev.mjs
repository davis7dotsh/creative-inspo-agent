import { spawn } from "node:child_process"

const children = [
  spawn("pnpm", ["dev:api"], { stdio: "inherit" }),
  spawn("pnpm", ["dev:web"], { stdio: "inherit" }),
]

let stopping = false

const stop = (signal) => {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill(signal)
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal))
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    stop("SIGTERM")
    if (signal) process.kill(process.pid, signal)
    process.exitCode = code ?? 1
  })
}

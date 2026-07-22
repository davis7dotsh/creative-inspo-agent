# Creative Agent

Creative Agent is a local-first CLI and three Codex skills for collecting, searching, and presenting YouTube inspiration.

## Run from a checkout

Use Node.js 24 and pnpm 11:

```sh
pnpm install
pnpm cli status
```

`pnpm cli` is the repository-local command prefix. For example:

```sh
pnpm cli auth status
pnpm cli videos list
```

Build `dist/` and link the `creative-agent` executable when a command available outside the checkout is useful:

```sh
pnpm build
pnpm link --global
creative-agent status
```

## Agent JSON contracts

Canonical input and output are JSON. Commands that accept JSON read it from stdin. Their current input contracts are available as JSON Schema:

```sh
pnpm cli schema embed
pnpm cli schema videos-upsert
pnpm cli schema videos-search
```

Local state is initialized beneath `~/.creative-inspo-agent/`. Set `CREATIVE_AGENT_HOME` to use a different root.

## Validate

```sh
pnpm validate
```

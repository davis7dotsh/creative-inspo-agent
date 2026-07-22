# Assets Explorer

Assets Explorer is the local, read-only browser for the Creative Agent YouTube corpus. It runs a
React/Vite client on `127.0.0.1:5173` and a separate Effect HTTP API on `127.0.0.1:4318`.

From the repository root:

```sh
pnpm assets:dev
```

The API reads `~/.creative-inspo-agent/creative-agent.sqlite` directly in SQLite read-only mode.
Set `CREATIVE_AGENT_HOME` to point both the CLI and explorer at another local state directory, or
`ASSETS_EXPLORER_PORT` to change the API port. The Vite proxy target should be changed alongside a
non-default API port.

## Architecture

- `src/contracts`: shared schemas and the typed Effect `HttpApi` contract.
- `src/server/services`: portable `AssetCatalog` and `AssetMedia` interfaces.
- `src/server/layers`: the local SQLite and filesystem implementations.
- `src/server/http`: typed JSON handlers and guarded thumbnail/avatar streaming routes.
- `src/client`: the React explorer and Vite client.

The client never receives local filesystem paths. A future hosted version can replace the local
catalog and media Layers while retaining the same API and UI contracts.

## Validation

```sh
pnpm --filter @creative-agent/assets-explorer validate
```

# Creative Agent product specification

## Product

Creative Agent is a personal, local-first agent toolkit for collecting and searching YouTube inspiration. It combines a composable TypeScript CLI with repository-local Codex skills so an agent can import public YouTube videos, enrich their thumbnails for retrieval, search the resulting library conversationally, and help develop titles and thumbnail directions.

The first version is for one user and focuses only on YouTube videos. Simplicity is the primary design constraint.

## Core workflow

1. Invoke `import-youtube-inspo` with pasted video, channel, or playlist URLs.
2. The skill uses the separately installed `oytc` CLI to resolve public YouTube data.
3. The skill downloads the best available thumbnail, uses GPT-5.6 Luna sub-agents to produce factual thumbnail descriptions, and asks `creative-agent` to embed the searchable text.
4. Once every item is prepared, the skill submits one JSON batch to `creative-agent` for an atomic database upsert.
5. In another Codex task, invoke `find-youtube-inspo` with a creative brief, reference image, reference video, title idea, thumbnail direction, or any combination.
6. The skill uses flexible CLI search primitives, agent judgment, and selective visual review to return concise, diverse recommendations and help iterate on titles and thumbnails.

## V1 scope

### Included

- A `creative-agent` TypeScript CLI.
- A searchable local YouTube video library.
- Imports from video URLs, channel URLs, and playlist URLs.
- Global deduplication by YouTube video ID.
- Repeat imports update existing records.
- Atomic batch persistence after all enrichment succeeds.
- Title, thumbnail-description, keyword, and filtered search primitives.
- Listing, showing, deleting, and reindexing videos.
- OpenAI API-key login, logout, and status commands.
- JSON-first command input and output with optional human-readable tables.
- Repository-local `import-youtube-inspo` and `find-youtube-inspo` skills under `.codex/skills/`.

### Deferred

- Generic local assets.
- Hosted APIs and browser authentication.
- Cloudflare D1, R2, and Vectorize implementations.
- Recurring statistics refresh.
- Persistent search-session selections.
- Inspiration-board implementation and publishing.
- Named board templates.

## YouTube video data

Each stored video contains:

- YouTube video ID as the stable primary key.
- Title.
- Channel ID and channel title.
- Published timestamp.
- Duration.
- All thumbnail URLs returned by YouTube.
- The locally retained best available thumbnail.
- Current public statistics, including view count and comment count when available.
- A factual thumbnail description generated with `gpt-5.6-luna`.
- A title embedding.
- A thumbnail-description embedding.
- Embedding model and dimensions so records can be reindexed safely.
- Created and updated timestamps.

Descriptions should capture visible text, subjects, composition, colors, setting, action, and visual style without inventing subjective themes or broad tags.

Transcripts, descriptions, YouTube tags, comments, private analytics, like counts, and historical statistics are outside v1.

## Search behavior

Search is hybrid and agent-directed. The CLI exposes primitives rather than a hard-coded creative workflow. The skill decides which signals matter for each prompt and may combine:

- Semantic title similarity.
- Semantic thumbnail-description similarity.
- Keyword title matching.
- Channel, publish-date, duration, view-count, and asset-type filters.
- Selective visual inspection and reranking of promising thumbnails.

Search should favor relevance while retaining useful diversity across channels, visual approaches, title formulas, and popularity levels. Results should include local thumbnail paths, metadata, scores, and matched signal information so the agent can decide what to inspect and recommend.

Reference images are described with a vision-capable model and searched through their textual descriptions in v1. OpenAI's embedding endpoint is text-only, so direct raw-image vector search is deferred.

## Local storage

All user state is created automatically beneath `~/.creative-inspo-agent/`:

```text
~/.creative-inspo-agent/
  auth.json
  config.json
  creative-agent.sqlite
  assets/
    thumbnails/
  staging/
  boards/
```

- `auth.json` stores the OpenAI API key with file mode `0600` and must never be printed or logged.
- SQLite stores structured video metadata and local vectors.
- A local SQLite vector extension provides similarity search.
- Only the best thumbnail is downloaded; all source thumbnail URLs remain in SQLite.
- Staging keeps incomplete imports invisible. A failed batch leaves no visible database records.

The future hosted architecture will keep the same high-level capability contracts while implementing metadata in D1, blobs in R2, and vectors in Vectorize.

## CLI design

The executable is named `creative-agent`. It is one Node 24 package managed with pnpm and built around Effect v4 primitives.

Use Effect services and Layers to separate capability contracts from local and future hosted implementations. Use Effect for CLI parsing, configuration, filesystem access, SQL, HTTP, child processes, resource scopes, typed errors, and test Layers. Avoid an ORM; use Effect SQL and explicit migrations.

The CLI provides small, composable capabilities. The Codex skills own orchestration, progress narration, recovery, and creative judgment.

Initial capability groups:

- `auth`: login, logout, and status for the OpenAI API key.
- `config` or `status`: initialize and inspect local state safely.
- `embed`: create OpenAI text embeddings for prepared inputs.
- `videos`: atomically upsert a prepared JSON batch, search with flexible signals and filters, list, show, delete, and reindex.

Canonical agent I/O is JSON. Batch ingestion accepts JSON through stdin. Human-readable tables are optional presentation modes, not the data contract.

Default models:

- Thumbnail description: `gpt-5.6-luna`.
- Text embeddings: `text-embedding-3-large`, shortened to 1,536 dimensions.

Model IDs remain configurable. Embedding dimensions are fixed at 1,536 in v1 because the local SQLite vector schema has fixed-width columns.

## Skill design

Skills should remain concise and high-freedom. They describe available capabilities, hard boundaries, recovery behavior, and success criteria without scripting every conversational decision.

### `import-youtube-inspo`

- Accept video, channel, and playlist URLs from the conversation.
- Use `oytc` directly for public YouTube data rather than wrapping its fetching behavior in `creative-agent`.
- Detect a missing `oytc` executable, explain the dependency, and ask permission before installing it.
- Help the user configure `oytc` with an API key or OAuth when required; public v1 data should prefer the simpler API-key path.
- Use available sub-agents with GPT-5.6 Luna to describe thumbnails, with a sequential fallback when parallel agents are unavailable.
- Keep the user informed about meaningful phases without exposing secrets or dumping noisy logs.
- Commit only after every video has been fetched, downloaded, described, and embedded.
- Finish with a concise import report.

### `find-youtube-inspo`

- Interpret whether the user is exploring titles, thumbnails, or both.
- Use one or more CLI search primitives as useful for the brief.
- Work with text, video, and image references supplied in the conversation.
- Use metadata and stored descriptions broadly, then inspect a manageable visual shortlist when useful.
- Keep a working selection within the Codex task and provide concise recommendations with reasoning.
- Favor relevance while introducing enough diversity to support inspiration.

## Inspiration boards

Board work is deferred to a separate effort. The intended direction is deliberately loose:

- Each board is an independent TypeScript React Vite project under `~/.creative-inspo-agent/boards/<name>/`.
- Boards do not share a renderer, package, schema, or runtime dependency.
- There is no `board.json` requirement.
- A future skill will start from guidelines and a strong example template, then let the agent create and edit the actual Vite project.
- The default visual direction is a polished, responsive wall of thumbnails with titles, channel information, and restrained statistics—minimal chrome, no walls of text, unnecessary subheadings, or all-caps decoration.
- Clicking a video opens YouTube in a new tab.
- Browser automation may be used for preview and visual validation; browser login is deferred.

## Tooling and quality

- Node.js 24.
- pnpm.
- TypeScript.
- Effect v4 with exact matching versions pinned because current v4 APIs are beta.
- Biome for formatting and linting.
- Vitest for tests.
- Effect semantic diagnostics included in the check command.
- Avoid explicit return types unless necessary.
- Do not use `as any`; keep real type safety and prefer inference.

Required validation commands should cover formatting, type and Effect semantic checks, linting, unit tests, SQLite integration tests, CLI JSON contracts, and skill validation. Live OpenAI and YouTube smoke tests are opt-in and run only when credentials are available.

## V1 completion criteria

V1 is complete when:

1. A fresh machine can install the project and run `creative-agent`.
2. The CLI automatically creates safe local state beneath `~/.creative-inspo-agent/`.
3. OpenAI login, logout, and status behave safely without revealing the key.
4. A prepared multi-video JSON batch can be embedded and atomically imported into SQLite.
5. Repeat imports update records without duplication.
6. Videos can be searched through title semantics, thumbnail-description semantics, keywords, and supported filters.
7. Videos can be listed, inspected, deleted, and reindexed.
8. JSON output is stable and human-readable output is useful.
9. Both repository-local skills validate and accurately orchestrate their intended workflows.
10. Format, check, lint, and test commands pass.

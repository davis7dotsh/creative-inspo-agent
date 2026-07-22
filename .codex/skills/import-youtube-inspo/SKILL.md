---
name: import-youtube-inspo
description: Import public YouTube videos into the local Creative Agent library from video, channel, or playlist URLs. Use when the user wants to save, ingest, or bulk-add YouTube inspiration and enrich its titles and thumbnails for later search.
---

# Import YouTube inspiration

Use `oytc` for YouTube reads and `creative-agent` for embeddings and persistence. Keep orchestration, recovery, and progress narration in the task.

## Boundaries

- Import public data only. Prefer an API key; OAuth is unnecessary unless the user explicitly chooses it.
- Treat channel and playlist imports as one-time snapshots. Deduplicate videos by YouTube video ID.
- Prepare every item before the single atomic upsert. If any item fails, persist nothing.
- Never read, print, log, or request secrets in chat. Have the user enter keys only into interactive login prompts.

## Workflow

1. Extract the supplied video, channel, and playlist URLs.
2. Preflight dependencies and credentials before resolving URLs:
   - Prefer an installed `creative-agent`. In this repository, if it is not installed, use `pnpm cli` as the command prefix. If dependencies are absent, explain that `pnpm install` is required and ask before downloading them.
   - If `oytc` is missing, explain why it is needed and ask explicit permission before installing it. After approval on macOS or Linux, use the official checksum-verifying installer: `curl -fsSL https://davis7dotsh.github.io/open-yt-cli/install.sh | sh`. Do not add `sudo` or silently install software. Verify the result with `oytc version`.
   - Run `oytc status --format json` and inspect `api_key.configured` without `--check`, which also validates OAuth. If no API key is configured, start `oytc login` and have the user enter it in the no-echo prompt. Let the first required public-data read validate access; on a credential error, run `oytc login` and retry that read once.
   - Treat the Creative Agent `auth status` result as a local configuration check only. If unauthenticated, start `auth login` and use its interactive prompt. Inspect `schema embed`, then validate live access early with one short embedding input before doing thumbnail work.
3. Resolve the URLs with explicit JSON or JSONL `oytc` output, expand channels and playlists fully, deduplicate IDs, then fetch canonical video details in batches.
4. Tell the user how many unique videos were resolved. Run Creative Agent `status`, create a task-specific directory inside `data.storage.staging`, and download each best available thumbnail there while retaining every source thumbnail URL in the prepared record. Never use an unrelated system temporary directory.
5. Delegate factual thumbnail descriptions to sub-agents when available, selecting `gpt-5.6-luna` when model choice is supported. Give each sub-agent only the video IDs and local image paths it needs. Require JSON keyed by video ID and descriptions covering visible text, subjects, composition, colors, setting, action, and visual style without inferred themes. Work in manageable waves and verify each result maps to the correct image. If delegation or Luna is unavailable, perform the same work sequentially with an available vision-capable model.
6. Inspect `schema embed`, then pass every title and thumbnail description to `embed` through JSON stdin in valid-sized batches. Validate IDs, counts, model, dimensions, and vectors before continuing.
7. Inspect `schema videos-upsert`, build the prepared batch, and pass it through JSON stdin to `videos upsert` exactly once. Do not retry with a reduced batch after failure.
8. Report the applied count and inserted or updated videos in a concise table. On failure, state the failing phase and concrete error; never imply that anything was imported. Clean up only the task-specific staging directory after the terminal outcome.

Give short updates at meaningful phase boundaries: resolving, downloading, describing, embedding, and committing. Avoid noisy per-item narration unless diagnosing a failure. Use `schema` for JSON stdin contracts and command help for flags rather than guessing either.

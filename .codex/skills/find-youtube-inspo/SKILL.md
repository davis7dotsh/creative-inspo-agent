---
name: find-youtube-inspo
description: Search, curate, and visually review the local Creative Agent YouTube library for title and thumbnail inspiration. Use for creative briefs, title iteration, thumbnail directions, reference images or videos, conversational exploration, selecting diverse examples, and showing a working selection as an inline thumbnail grid.
---

# Find YouTube inspiration

Use `creative-agent` search primitives as building blocks. Let the conversation determine whether title signals, thumbnail signals, metadata, or a combination matters.

Only use normal YouTube videos. Treat anything under 180 seconds as a Short and exclude it from references and recommendations; a video of exactly 180 seconds is eligible.

## Workflow

1. Understand the creative goal and constraints already present in the conversation. Do not force a questionnaire when the intent is clear.
2. Inspect `creative-agent schema videos-search` (or `pnpm cli schema videos-search` in the repository), then run whichever `videos search` calls help: title semantic similarity, thumbnail-description semantic similarity, keyword title matching, and channel, publication-date, duration, or view-count filters. Always set `minDurationSeconds` to at least `180`, even though current ingestion also enforces that minimum. Use command help for flags rather than guessing either contract.
3. For a reference image, produce a factual visual description with a vision-capable model, preferring `gpt-5.6-luna` when available, and search that description against stored thumbnail descriptions.
4. For a reference video already in the library, first verify its stored duration is at least 180 seconds, then use its stored title, thumbnail, and description. For an external YouTube reference, use `oytc` when available; ask before installing it, verify the canonical duration before using it, and apply the import skill's authentication and secret-handling boundaries if setup is required.
5. Combine and rerank results with agent judgment. Favor relevance while retaining useful variation in channels, visual approaches, title formulas, and popularity.
6. Review metadata and stored descriptions broadly, then visually inspect only a manageable shortlist of promising local thumbnails. Do not load the entire candidate set as images by default.
7. Return concise recommendations with reasoning and useful metadata. If the user asks to see the thumbnails together, read [references/inline-thumbnail-grid.md](references/inline-thumbnail-grid.md) completely and render the working shortlist as an inline review grid.
8. Maintain the working selection in the current task. Do not persist an inline grid. Hand the selection to `generate-inspo` when the user wants original title-and-thumbnail concepts or generated assets, and use `create-inspo-page` when the user asks for a saved, editable, or published inspiration board.

Use absolute thumbnail paths from CLI results. Keep search iterative and adapt subsequent queries to the user's feedback rather than following a fixed sequence.

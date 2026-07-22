---
name: create-inspo-page
description: Create, iterate on, run, and publish standalone React and Vite inspiration pages from selected YouTube references. Use when the user wants to turn a working selection into a visual board, revise an existing inspiration page, preview it locally, or post it through Sites.
---

# Create an inspiration page

Turn the selected references in the current task into an independent visual project. Use the
canonical repository template as a strong starting point, then edit the copied project freely for
the user's brief.

## Workflow

1. Confirm the working selection, board name, and any creative direction already established in
   the conversation. Resolve missing video metadata or local assets with `creative-agent` search
   primitives when needed; inspect command help and schemas rather than guessing contracts.
2. Read `INSPO_PAGE_SPEC.md` and `templates/inspo-page/README.md` from the repository root. Treat
   `templates/inspo-page/` as an example and starting point, not a shared renderer or rigid schema.
3. Create a unique directory under `~/.creative-inspo-agent/boards/<name>/` and copy the template
   there without `node_modules`, `dist`, or `.openai/hosting.json`. Never overwrite an existing
   board or modify the canonical template while building a board.
4. Replace the example content with the selected videos and copy every used thumbnail and avatar
   into the new project's `public/` directory. Keep titles, channel information, useful public
   statistics, and YouTube links together. Each card must open its source video in a new tab.
5. Shape the actual React/Vite project around the user's intent. Favor an immersive, responsive
   wall with minimal chrome; avoid dashboard controls, walls of explanation, and unnecessary
   headings. Feature or arrange references with agent judgment rather than preserving input order.
6. Install dependencies only when absent, then run `pnpm validate`. Fix failures before presenting
   the board. Run the development server when the user asks to view or iterate on it, and use
   browser inspection when visual validation would materially help.
7. Iterate directly on the copied project. Keep the working selection in the task unless the user
   asks to add or remove references.
8. Publish only when requested. Use the available Sites building and hosting skills on the copied
   board, create a fresh Sites project binding for that board, validate the exact source, and return
   the production URL. Never reuse a binding from the canonical template or another board.

## Boundaries

- Do not create `board.json` or another prescribed board manifest.
- Do not introduce a shared renderer, package, runtime, or source dependency between boards.
- Do not publish, replace an existing board, or change access settings without the user's request.
- Keep the result self-contained so it can be edited, run, archived, and deployed independently.

Report the board path and video count concisely. Include the local URL when a preview is running and
the production URL when publishing succeeds.

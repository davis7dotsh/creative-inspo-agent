# Inspiration page template

A self-contained visual wall for a curated set of YouTube references. Copy this entire directory
to start a board, then freely change the title, content, layout, and assets in the copy.

## Run it

Requires Node.js 24 or newer and pnpm 11.

```sh
pnpm install
pnpm dev
```

Video content lives in `src/videos.ts`. Thumbnails and channel avatars are intentionally local in
`public/`, so copied boards have no remote image dependencies.

## Validate it

```sh
pnpm format:check
pnpm check
pnpm lint
pnpm test
pnpm build
```

Run every validation in sequence with `pnpm validate`. Use `pnpm format` to apply formatting.

The production build also stages the static Vite output with a minimal Cloudflare Worker entrypoint
so the project can be packaged and deployed with Sites.

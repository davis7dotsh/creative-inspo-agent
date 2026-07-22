# Inspiration page template specification

## Purpose

The inspiration page is an immersive visual wall for reviewing a curated set of YouTube references. It should help someone absorb title and thumbnail ideas at a glance without turning into a dashboard, media manager, or editing interface.

This work is separate from the Creative Agent CLI, ingestion pipeline, and searchable library.

## Template model

- The canonical example lives at `templates/inspo-page/` in this repository.
- It is a complete React, TypeScript, Vite, and Tailwind application managed with pnpm.
- It is a polished, populated example rather than an empty scaffold.
- To create a board, an agent copies the template directory wholesale and then freely edits the new project.
- Every generated board is an independent Vite project. Boards share no renderer, package, schema, runtime, or source files after copying.
- There is no `board.json` requirement or other prescribed persistence schema.
- A simple example data module such as `src/videos.ts` is welcome, but agents may restructure or remove it.
- Generated projects should copy their thumbnails and channel avatars into the project. They must remain self-contained and publishable without remote asset dependencies.
- Publishing is deferred to later work.

## Experience

The page should feel like an immersive inspiration wall rather than a practical comparison workspace.

- Use a clean white canvas.
- Make imagery dominant and keep interface chrome nearly absent.
- Present a dense, disciplined grid of 16:9 YouTube thumbnails.
- Keep cards borderless. The thumbnail itself is the card.
- Use square corners.
- Use approximately `3–4px` gaps between thumbnails.
- Keep a generous but not oversized outer page gutter. The page should not run wall-to-wall.
- Avoid walls of text, explanatory sections, unnecessary subheadings, all-caps decoration, filters, categories, sidebars, search, settings, routing, editing controls, or other dashboard features.
- Use a clean neutral system-font stack with restrained weights.

## Header

The header contains only:

- The board title.
- A muted video count beside it.

The header uses the same outer gutter as the grid and scrolls away naturally. It is not sticky.

## Grid

Most thumbnails use one consistent base size. A board may feature between one and four videos at the agent's discretion.

- Featured videos use one controlled larger size: exactly a `2 × 2` grid span.
- Featured and regular cards retain the same 16:9 aspect ratio and typography.
- The two featured entries in the example template should be the visually strongest references, not merely the first two records.
- Use dense grid packing without overflow, irregular card shapes, text-size changes, or accidental holes.

Responsive target:

- Wide desktop: 7 columns.
- Typical laptop: 5 columns.
- Tablet: 3 columns.
- Mobile: 1–2 columns as space allows.
- Featured cards collapse to the regular card size on mobile.

Desktop is the primary design target. Tablet and mobile must remain responsive, polished, and usable.

## Card metadata

Metadata lives directly over the thumbnail rather than in a surrounding panel.

Default state:

- Apply a subtle bottom gradient only as needed for legibility.
- Show a small circular channel avatar.
- Show a one-line truncated title.
- Show a compact view count such as `1.4M views`.
- Keep this information small and anchored in a thumbnail corner.

Hover state:

- Keep the card and surrounding layout completely stationary.
- Darken the thumbnail.
- Expand the metadata upward in place.
- Reveal the full title, channel name, exact view count, publish date, and duration.
- Show a pointer cursor.
- Apply a restrained scale or lift and a smooth overlay transition.
- Clicking anywhere on the card opens the YouTube video in a new tab.

On touch devices, retain the compact default metadata and open the video immediately when tapped. Expanded hover-only details do not require a separate mobile interaction.

## Motion and loading

- Lazy-load thumbnails below the fold.
- Reserve each thumbnail's aspect ratio before loading to prevent layout shifts.
- On initial load, fade visible images in with short randomized delays so they appear in a subtle random order.
- Use opacity as the primary entrance effect; avoid conspicuous movement.
- Lazy-loaded images may fade in individually when ready.
- Disable nonessential animation when the user prefers reduced motion.

## Example content

The template includes approximately 30–40 polished synthetic technology-video entries so it has meaningful scroll depth and feels complete.

- Use original synthetic thumbnails and fictional channel avatars stored locally.
- Do not depend on remote stock images, external image URLs, real creators, or copyrighted channel identities.
- Create believable technology-video titles, publication dates, durations, channels, and varied view counts.
- Use unique fictional channels; recurring channel identities are not necessary.
- Demonstrate varied thumbnail strategies, including faces, devices and objects, typography-led treatments, cinematic imagery, diagrams, minimal compositions, and other recognizable YouTube approaches.
- Include realistic embedded headline text in some thumbnails.
- Avoid making the collection feel like repeated variations of one image or subject.
- Mark exactly two example entries as featured.

## Accessibility

Accessibility should be present without adding visual clutter.

- Use semantic links for video cards.
- Provide useful accessible labels that include the title and channel.
- Preserve visible keyboard focus.
- Ensure metadata remains legible across bright and dark thumbnails.
- Respect reduced-motion preferences.
- Give images useful alt text and explicit dimensions or aspect ratios.
- Ensure links opened in new tabs use safe relationship attributes.

## Non-goals

The template does not include:

- Search or filtering.
- Categories, tags, or grouping.
- Editing or drag-and-drop authoring.
- Saved application state or persistence.
- A shared renderer or board schema.
- A router or multiple page views.
- Authentication.
- Publishing or hosting configuration.
- A component library or state-management framework beyond React.

## Acceptance criteria

The template is ready when:

1. `templates/inspo-page/` is a self-contained pnpm React/TypeScript/Vite/Tailwind project.
2. It contains 30–40 original synthetic technology-video entries with local thumbnails and avatars.
3. The white, dense thumbnail wall matches the layout and metadata behavior described above.
4. Two visually strong videos render as predictable `2 × 2` featured cards on desktop and collapse normally on mobile.
5. Hover reveals complete metadata without moving or resizing the layout.
6. Every card opens its video URL in a new tab and remains keyboard accessible.
7. Lazy loading, aspect-ratio reservation, randomized fade-in, and reduced-motion behavior work correctly.
8. Visual inspection passes at wide desktop, laptop, tablet, and mobile widths.
9. There is no horizontal overflow, broken packing, unexpected layout shift, console error, or missing local asset.
10. Format, typecheck, lint, tests, and production build pass using the template's documented pnpm commands.

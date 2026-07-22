# Inline thumbnail grid

Use this for a fast, in-conversation review of a selected shortlist. Use `create-inspo-page` instead when the user wants a persistent, editable, or published board.

## Build the grid

1. Read the current `visualize` skill completely and follow its inline HTML output contract. Write the fragment in the current task's thread-scoped visualization directory, not in this repository.
2. Keep only the chosen shortlist, usually 6-12 videos. For each item retain the YouTube URL, title, formatted view count when available, a short creative rationale, factual alt text, and absolute local thumbnail path.
3. Create temporary thumbnail copies at about 640x360 JPEG with moderate compression, such as ffmpeg quality 4. Do not modify library originals. This keeps a 12-item grid comfortably below the visualization's 2 MB limit.
4. Embed every image as a `data:image/jpeg;base64,...` URI. Do not reference local file paths or YouTube image hosts: the inline frame cannot load them reliably.
5. Create one transparent, unframed root containing a semantic list of linked items. Make the whole item an `<a>` that opens its YouTube URL in a new tab with `rel="noreferrer"`.
6. Use this visual hierarchy for every item:
   - 16:9 thumbnail with `object-fit: cover` and a 10px radius
   - `.viz-badge` view count at the thumbnail's bottom-right, only when available
   - medium-weight title below the thumbnail
   - one muted `.text-small` line naming the creative pattern or why the reference matters
7. Use a three-column grid with `gap: 18px 14px`; switch to two columns below 620px and one below 390px. Use `var(--foreground)`, `var(--muted)`, and host utilities instead of hardcoded light or dark colors. Underline the title on link hover or keyboard focus.
8. Keep the fragment literal and self-contained: no page shell, fetches, fixed outer width, viewport-height layout, internal scrolling, explanation, or duplicated prompt. Give the root a unique ID and scope every custom selector to it.

The item structure should stay close to:

```html
<a class="thumbnail-item" href="https://youtube.com/watch?v=VIDEO_ID" target="_blank" rel="noreferrer" role="listitem">
  <div class="thumbnail-media">
    <img src="data:image/jpeg;base64,..." alt="Factual thumbnail description">
    <span class="viz-badge">337K views</span>
  </div>
  <div class="thumbnail-title">Video title</div>
  <div class="thumbnail-meta text-small text-muted">Creative pattern</div>
</a>
```

## Verify and return

- Confirm the card count matches the shortlist and every title, URL, view count, rationale, alt text, and image belongs to the same video.
- Confirm every image is embedded, no placeholder data remains, and the fragment is under 2 MB.
- Preview with the `visualize` skill's bundled `scripts/render.py` when layout or theme behavior needs inspection.
- Put `Click any thumbnail to open the video.` immediately before the inline visualization, then emit the required `::codex-inline-vis{file="<title>.html"}` directive on its own line.
- Do not call the inline grid a saved board or offer a public link unless the user asks to move into the `create-inspo-page` workflow.

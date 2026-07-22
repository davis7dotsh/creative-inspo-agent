---
name: generate-inspo
description: Generate original YouTube title and thumbnail concepts by remixing a curated working selection with the user's video idea, then create and iterate on new thumbnail assets with image generation. Use after find-youtube-inspo, when the user wants alternative creative directions, generated thumbnail mockups, back-and-forth visual iteration, or new concepts appended to an existing inspiration page.
---

# Generate inspiration

Turn a researched selection into original creative directions and thumbnail assets. Treat the
references as ingredients to analyze and recombine, not images to copy.

## Workflow

1. Establish the video idea, audience, constraints, and working selection from the current task.
   If there is no meaningful curated selection yet, invoke `find-youtube-inspo` first and search
   conversationally until the user has a useful set. Do not replace discovery with arbitrary
   references or force a questionnaire when the brief is already clear.
2. Choose the closest and most instructive finalists, defaulting to three. Adjust the count when
   the selection clearly needs more range or fewer references. Distinguish title references from
   thumbnail references; one video may inform both. Visually inspect each selected thumbnail and
   summarize only the transferable traits: hook, composition, subject treatment, text strategy,
   contrast, color, emotion, and curiosity mechanism.
3. Propose several materially different title-and-thumbnail directions for the user's idea. Pair
   each direction with title options, a concise visual premise, the reference traits being remixed,
   and what makes the direction distinct. Preserve the user's exact claims and constraints. Avoid
   cloning a reference's layout, creator identity, logo, or signature visual treatment.
4. When the brief is actionable, use the built-in `image_gen` capability to produce a couple of
   strong thumbnail alternatives by default. Use one call per distinct alternative, label every
   input image as a reference rather than an edit target, and include any required thumbnail text
   verbatim. Keep the prompts specific to the paired title and video idea. Proceed without another
   approval round unless a missing choice would materially change the result.
5. Visually inspect every output for composition, text accuracy, reference leakage, and fit with its
   paired title. Show the viable assets inline with their title options and a short rationale. State
   concrete flaws instead of presenting a weak generation as finished.
6. Iterate through focused changes. Preserve the user's selected direction and unaffected elements,
   change one major variable at a time, and generate a new version rather than overwriting an older
   asset. Keep the working references, title options, prompts, and feedback in the current task so
   later rounds build on actual decisions.

## Inspiration page integration

- If the current task already has an inspiration-page project, update that project as part of each
  meaningful generation round. Follow `create-inspo-page` for project conventions and validation.
- Copy generated assets into a clear local folder inside the page's `public/` directory. Use stable,
  descriptive, versioned filenames; never reference an asset only from the image generator's
  default output location.
- Append a visually cohesive generated-concepts area after the existing reference wall. Preserve
  the original references and the board's established design. Include each viable generated image,
  its paired title options, and only the minimal rationale needed for review.
- Run the page's `pnpm validate` after edits. Update a running local preview when available, but do
  not publish or redeploy the page unless the user asks.
- If no page exists, keep the round as inline exploration and report the generated asset paths. Use
  `create-inspo-page` when the user asks to create or save a board.

## Boundaries

- Generate new concepts; do not make near-copies of a source thumbnail.
- Do not invent factual claims, results, people, products, or endorsements for the user's video.
- Do not discard previous rounds or overwrite page assets unless explicitly asked.
- Do not claim an asset, page update, validation, preview, or deployment succeeded without verifying
  it.

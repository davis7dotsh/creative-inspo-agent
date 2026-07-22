# Creative Agent setup

This guide is for an agent preparing a checkout for a user. The goal is a validated local CLI,
working OpenAI and public YouTube access, initialized storage, and four discoverable Codex skills.

## Setup boundaries

- Never ask the user to paste an API key into chat. Let them enter secrets only in the relevant
  interactive, no-echo login prompt.
- Ask before downloading dependencies, installing `oytc`, or globally linking the CLI.
- Prefer a YouTube Data API key for public data. Configure OAuth only when the user explicitly
  wants their private channel data or Analytics.
- Use the repository-local `pnpm cli` command until the optional global link has been verified.
- Do not report the project as ready solely because credentials are stored. Complete the live
  checks below, or state exactly which checks the user chose to skip.

## 1. Onboard the user

Before changing the machine, inspect the checkout and ask one concise group of questions covering:

1. Whether the default local data directory, `~/.creative-inspo-agent/`, is acceptable.
2. Whether the user already has an OpenAI API key and a YouTube Data API key available.
3. Whether they need public YouTube data only or also want read-only channel and Analytics access.
4. Whether they want the optional global `creative-agent` command or are happy with `pnpm cli`.

Explain that the OpenAI key is used for text embeddings and that `oytc` uses the YouTube key to
resolve public videos, channels, playlists, metadata, and thumbnails. Do not request the values in
the conversation.

## 2. Verify prerequisites

Run these from the repository root:

```sh
node --version
pnpm --version
```

The project requires Node.js 24 or newer and pnpm 11. If either tool is missing or outside the
supported range, explain what is needed and get permission before installing or upgrading it.

Check whether project dependencies are already present. If they are missing, ask before running:

```sh
pnpm install
```

Then validate the checkout:

```sh
pnpm validate
```

This must pass formatting, TypeScript and Effect diagnostics, linting, tests, the production build,
and validation of all four skills. Fix project failures before continuing; do not work around a
failed validation by omitting checks.

## 3. Initialize the local CLI

Run:

```sh
pnpm cli status
pnpm cli auth status
```

`status` creates and reports the local storage paths. By default, user state lives under:

```text
~/.creative-inspo-agent/
  auth.json
  config.json
  creative-agent.sqlite
  assets/thumbnails/
  staging/
  boards/
```

If the user chose another location, set `CREATIVE_AGENT_HOME` consistently for every Creative
Agent command. Do not move or merge an existing data directory without explicit approval.

If the user requested a command available outside the checkout, build and link it only after the
repository validation succeeds:

```sh
pnpm build
pnpm link --global
creative-agent status
```

Continue using `pnpm cli` if the link is not requested or cannot be verified.

## 4. Configure OpenAI access

Check the non-secret status first:

```sh
pnpm cli auth status
```

If it reports `authenticated: false`, start the interactive login:

```sh
pnpm cli auth login
```

Have the user type the key directly into the prompt. Never put it in shell history, command
arguments, logs, a committed file, or chat. Re-run `pnpm cli auth status` afterward.

Tell the user that the following smoke test makes a small paid OpenAI embeddings request. After
they approve it, inspect the schema and run one short input:

```sh
pnpm cli schema embed
printf '%s\n' '{"inputs":[{"id":"setup-check","text":"YouTube thumbnail inspiration"}]}' \
  | pnpm --silent cli embed \
  | jq '{ok, items: [.data.items[] | {id, model: .embedding.model, dimensions: .embedding.dimensions}]}'
```

Readiness requires `ok: true`, one returned item, the configured embedding model, and 1,536
dimensions. If `jq` is unavailable, inspect the JSON without installing another tool unless the
user approves it.

## 5. Configure public YouTube access

Check for `oytc`:

```sh
command -v oytc
oytc version
```

If it is missing, explain that the import skill uses it to resolve public YouTube URLs and ask for
permission to install it. On macOS or Linux, the official checksum-verifying installer is:

```sh
curl -fsSL https://davis7dotsh.github.io/open-yt-cli/install.sh | sh
```

Do not add `sudo`. Verify the installed command with `oytc version`.

Inspect status without validating unrelated OAuth credentials:

```sh
oytc status --format json
```

If `api_key.configured` is false, run `oytc login` and let the user enter their YouTube Data API key
in its no-echo prompt. For public imports, do not use `oytc login --oauth`.

Validate the API key with a small public read, using `--` before the video ID so it cannot be parsed
as a flag:

```sh
oytc video get --format json -- dQw4w9WgXcQ
```

If the user explicitly requested private channel or Analytics reads, run `oytc login --oauth` as a
separate step and let them complete browser authorization. Keep the requested scope narrow and
verify that access with the specific read they intend to use.

## 6. Verify the library and search path

Inspect the current library without changing it:

```sh
pnpm cli videos list --limit 5 --format table
pnpm cli schema videos-search
```

If the library already contains videos, run a local keyword smoke test:

```sh
printf '%s\n' '{"mode":"keyword","query":"AI","limit":5,"filters":{"minDurationSeconds":180}}' \
  | pnpm --silent cli videos search --format table
```

An empty new library is valid. Populate it by invoking `import-youtube-inspo` with a user-supplied
video, channel, or playlist URL; do not invent an initial collection. The import skill will resolve
metadata, exclude videos under 180 seconds, download thumbnails, describe them, embed searchable
text, and commit one atomic batch.

## 7. Confirm skill discovery

The checkout should expose these repository-local skills:

- `import-youtube-inspo`
- `find-youtube-inspo`
- `generate-inspo`
- `create-inspo-page`

Confirm each directory contains a valid `SKILL.md`, then run the focused validator if needed:

```sh
pnpm validate:skills
```

New Codex tasks opened from this repository should discover the skills automatically. If an
existing task does not show a newly added skill, start a fresh task from the repository rather than
copying the skill into a global directory.

## Ready-to-use checklist

Before handing the project back to the user, verify and report:

- Supported Node.js and pnpm versions are active.
- `pnpm validate` passes.
- `pnpm cli status` reports the intended storage root.
- OpenAI authentication is configured and the approved live embedding check passes.
- `oytc` is installed, its API key is configured, and the public read succeeds.
- All four skills pass `pnpm validate:skills` and are discoverable from repository tasks.
- Existing library and board counts are reported without claiming empty state is a failure.
- The global CLI link, OAuth, and an initial import are clearly identified as completed, declined,
  unnecessary, or still pending.

End with the exact command prefix the user should use (`pnpm cli` or `creative-agent`), the local
storage path, and a suggested first action such as importing a channel or searching an existing
library.

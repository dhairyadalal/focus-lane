# Focus Lane

Focus Lane is a small, local browser sidebar for choosing one task and working on it in a timed block. It runs in Chrome and Firefox without an account or server.

## What it does

- Keeps one selected task and its next action visible above the timer.
- Runs 5, 10, 15, or 25 minute focus blocks. The timer continues when the sidebar closes. Chrome resumes an active block after restart; a temporary Firefox add-on must be loaded again after restart.
- Lets you add tasks, reorder the focus queue by dragging, mark tasks complete, and restore them from the Completed tab.
- Prompts for a short progress note, blocker, and next action after a focus block.
- Lets you add local work blocks and commitments to a collapsible daily schedule.
- Includes a collapsible box breathing guide.

Task data and reflections stay in the browser's local extension storage. Chrome and Firefox each keep their own copy. There is no account, cloud sync, calendar sync, or AI service connection.

## Build

Install [Node.js 18 or newer](https://nodejs.org/), clone this repository, and run:

```sh
npm run build
```

There are no npm dependencies. The command creates `dist/chrome` and `dist/firefox`. Run it again after changing source files or your private task file.

## Install in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Select **Load unpacked** and choose this repository's `dist/chrome` folder.
3. Click the Focus Lane toolbar icon to open the side panel. Pin the icon if you want it always visible.

After a rebuild, select **Reload** on the Focus Lane card at `chrome://extensions`.

## Install in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on** and choose `dist/firefox/manifest.json`.
3. Open Focus Lane from Firefox's sidebar controls, or press `Alt` + `Shift` + `P`.

Firefox removes temporary add-ons when it restarts, so load the manifest again then. After a rebuild, select **Reload** beside Focus Lane on the debugging page.

## Set up an AI agent to manage tasks

Point your coding agent at this repository and ask it to read [AGENTS.md](AGENTS.md). The agent can create and maintain `tasks.local.json`, which is ignored by Git. A useful first prompt is:

> Read AGENTS.md in this repository. Create tasks.local.json from my current priorities. Give each task a stable seedKey, a realistic minute estimate, and a concrete nextAction. Run npm run build and tell me which browser reload step I need.

The agent should use [tasks.example.json](tasks.example.json) as the schema and follow the detailed [agent setup guide](docs/agent-setup.md). After the build and browser reload, new tasks appear in Focus Lane. Existing completion status, queue order, and tasks added in the sidebar are preserved. To remove a seeded task permanently, remove it from `tasks.local.json`, rebuild, reload, and delete it in the sidebar. Removing it from the file alone leaves the browser's copy in place.

Never commit `tasks.local.json` or `dist/`. Built extension folders can contain your private tasks.

## Development

Edit shared UI and behavior in `src/shared/`. Browser specific manifests and sidebar setup live in `src/chrome/` and `src/firefox/`. `scripts/build.mjs` assembles both extensions and validates the private task file when present.

```sh
npm run build
node --check dist/chrome/sidepanel.js
node --check dist/firefox/sidepanel.js
```

Focus Lane is released under the [MIT license](LICENSE).

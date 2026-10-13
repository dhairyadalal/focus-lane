# Agent setup and task update guide

Focus Lane has no agent connection or background sync. An AI coding agent updates a private JSON file in this repository, the build embeds those tasks in the extension, and the user reloads the extension. This gives the agent a reliable file-based handoff without putting personal tasks in the public repository.

## First setup

1. Check that Node.js 18 or newer is available.
2. Copy `tasks.example.json` to `tasks.local.json` at the repository root.
3. Replace the empty `tasks` array with the user's concrete tasks. Keep the file valid JSON.
4. Run `npm run build`. The build validates every entry and writes `dist/chrome` and `dist/firefox`.
5. Give the user the relevant reload or installation step from `README.md`.

Each task has this shape:

```json
{
  "seedKey": "draft-outline",
  "title": "Draft the report outline",
  "project": "Research",
  "minutes": 25,
  "nextAction": "Open the report document and write five section headings."
}
```

`seedKey`, `title`, and `minutes` are required. `project` and `nextAction` are optional. Keep `seedKey` stable across edits, including title changes. `minutes` estimates the task, while the timer runs one 5, 10, 15, or 25 minute block at a time.

## Updating tasks

Read the existing `tasks.local.json` first. Add or edit entries in place. A new `seedKey` creates a task; an existing key updates its title, project, and estimate. Completion state and queue order are retained. If the user changed the next action during a timer reflection, that newer local next action is retained. Deleting an entry from the file does not delete the browser's copy. To remove a seeded task permanently, remove it from the file, rebuild, reload, and delete it in the sidebar.

After saving, run `npm run build` and tell the user to reload Focus Lane. The agent cannot infer the user's completed tasks from `tasks.local.json` because that state lives in browser storage. Ask the user for a status update when it matters; never silently mark tasks complete in the seed file.

## Privacy and scope

`tasks.local.json` and `dist/` are ignored by Git. Before publishing changes, inspect `git status` and the diff for personal content. The agent should not claim that Focus Lane syncs with Notion, a calendar, or an AI service. It is a local sidebar and file-based task handoff.

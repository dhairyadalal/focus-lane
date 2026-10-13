# Instructions for coding agents working on Focus Lane

Read `docs/agent-setup.md` before updating a user's task inventory.

- Keep personal tasks in `tasks.local.json` at the repository root. This file and `dist/` are ignored by Git because builds may contain personal tasks.
- Use `tasks.example.json` for the JSON shape. Do not put user-specific tasks, account details, tokens, or private notes in tracked source files or documentation.
- Give each task a stable `seedKey` made of lowercase letters, numbers, and hyphens. Reuse that key when updating the same task.
- Use a concrete action for `title` and, when possible, an even smaller physical step for `nextAction`. Set `minutes` to a positive whole-number estimate for the whole task; Focus Lane offers 5, 10, 15, and 25 minute work blocks.
- Preserve existing entries and keys unless the user asks to remove or rename them. A seed file adds or updates tasks in browser storage; it does not delete browser tasks.
- Do not set `status`, `completedAt`, or browser storage fields in the seed file. The extension owns progress and completion state.
- Run `npm run build` after editing the task file. Report any validation error clearly. Tell the user to reload the extension in their browser. Do not assume the build itself updates a running extension.
- For feature changes, edit `src/`, then build both targets and check both generated entry scripts with `node --check`.

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const source = new URL("../src/", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const targets = ["chrome", "firefox"];
const localTasks = new URL("../tasks.local.json", import.meta.url);

async function taskSeed() {
  let raw;
  try {
    raw = await readFile(localTasks, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.tasks)) throw new Error("tasks.local.json must contain a tasks array.");
  const keys = new Set();
  const tasks = parsed.tasks.map((task, index) => {
    const label = `tasks[${index}]`;
    if (!task || typeof task !== "object" || Array.isArray(task)) throw new Error(`${label} must be an object.`);
    if (typeof task.seedKey !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(task.seedKey)) throw new Error(`${label}.seedKey must be a lowercase ID using letters, numbers, and hyphens.`);
    if (keys.has(task.seedKey)) throw new Error(`Duplicate seedKey: ${task.seedKey}`);
    keys.add(task.seedKey);
    if (typeof task.title !== "string" || !task.title.trim()) throw new Error(`${label}.title is required.`);
    if (!Number.isInteger(task.minutes) || task.minutes < 1) throw new Error(`${label}.minutes must be a positive whole number.`);
    if (task.project !== undefined && typeof task.project !== "string") throw new Error(`${label}.project must be text.`);
    if (task.nextAction !== undefined && typeof task.nextAction !== "string") throw new Error(`${label}.nextAction must be text.`);
    return {
      seedKey: task.seedKey,
      title: task.title.trim(),
      minutes: task.minutes,
      project: task.project?.trim() || "",
      nextAction: task.nextAction?.trim() || ""
    };
  });
  const version = createHash("sha256").update(JSON.stringify(tasks)).digest("hex").slice(0, 16);
  return { version, tasks };
}

const seed = await taskSeed();

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const target of targets) {
  const targetOutput = new URL(`../dist/${target}/`, import.meta.url);
  await cp(new URL("shared/", source), targetOutput, { recursive: true });
  if (seed) await writeFile(new URL("task-seed.js", targetOutput), `export const TASK_SEED = ${JSON.stringify(seed)};\n`);
  await cp(new URL(`${target}/platform.js`, source), new URL("platform.js", targetOutput));
  await cp(new URL(`${target}/manifest.json`, source), new URL("manifest.json", targetOutput));
  console.log(`Built ${target} extension in ${fileURLToPath(targetOutput)}`);
}

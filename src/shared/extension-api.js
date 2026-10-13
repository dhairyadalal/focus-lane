// Use the browser's extension API when installed, or a small local adapter for
// the standalone demo. Demo data lives in this browser's localStorage only.
const candidate = globalThis.browser ?? globalThis.chrome;
const browserExtension = candidate?.storage?.local && candidate?.runtime?.sendMessage ? candidate : null;
const demoKey = "focus-lane-demo-v1";
const demoTasks = [
  { id: "demo-outline", title: "Outline a short report", project: "Demo", minutes: 15, nextAction: "Write three section headings.", status: "inbox", createdAt: 1 },
  { id: "demo-review", title: "Review one document", project: "Demo", minutes: 10, nextAction: "Open the document and mark one question.", status: "inbox", createdAt: 2 }
];

function createDemoExtension() {
  const listeners = new Set();
  let data;
  try {
    data = JSON.parse(localStorage.getItem(demoKey) || "null");
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object") {
    data = { tasks: demoTasks, selectedTaskId: demoTasks[0].id };
    localStorage.setItem(demoKey, JSON.stringify(data));
  }

  return {
    isDemo: true,
    storage: {
      local: {
        async get(keys) {
          const current = JSON.parse(localStorage.getItem(demoKey) || "{}");
          return Object.fromEntries(keys.filter((key) => key in current).map((key) => [key, current[key]]));
        },
        async set(patch) {
          const current = JSON.parse(localStorage.getItem(demoKey) || "{}");
          const changes = Object.fromEntries(Object.entries(patch).map(([key, newValue]) => [key, { oldValue: current[key], newValue }]));
          localStorage.setItem(demoKey, JSON.stringify({ ...current, ...patch }));
          for (const listener of listeners) listener(changes, "local");
        }
      },
      onChanged: { addListener(listener) { listeners.add(listener); } }
    },
    runtime: { async sendMessage() {} }
  };
}

export const ext = browserExtension || createDemoExtension();

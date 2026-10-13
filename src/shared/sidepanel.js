import { ext } from "./extension-api.js";
import { TASK_SEED } from "./task-seed.js";

const DEFAULTS = {
  tasks: [],
  meetings: [],
  workBlocks: [],
  sessions: [],
  reflections: [],
  activeSession: null,
  settings: { workStart: "09:00", workEnd: "17:30" },
  selectedTaskId: null,
  selectedMode: "focus25",
  appliedTaskSeedVersion: null
};

let state = structuredClone(DEFAULTS);
let tick;
let completingSessionId = null;
let draggedTaskId = null;

const $ = (selector) => document.querySelector(selector);
const dayKey = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
const uid = () => crypto.randomUUID();
const minutesAt = (date) => date.getHours() * 60 + date.getMinutes();
const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const parseClock = (value) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };

async function applyTaskSeed() {
  if (!TASK_SEED?.version || state.appliedTaskSeedVersion === TASK_SEED.version) return;
  const seeded = TASK_SEED.tasks.map((task) => {
    const previous = state.tasks.find((item) => item.seedKey === task.seedKey || (item.title === task.title && item.project === task.project));
    return {
      id: previous?.id || "seed-" + task.seedKey,
      status: previous?.status || "inbox",
      createdAt: previous?.createdAt || Date.now(),
      ...task,
      completedAt: previous?.completedAt || null,
      nextAction: previous?.nextAction && previous.nextAction !== previous.seedNextAction ? previous.nextAction : task.nextAction,
      seedNextAction: task.nextAction
    };
  });
  const seededById = new Map(seeded.map((task) => [task.id, task]));
  const existingIds = new Set(state.tasks.map((task) => task.id));
  await save({
    tasks: [
      ...state.tasks.map((task) => seededById.get(task.id) || task),
      ...seeded.filter((task) => !existingIds.has(task.id))
    ],
    appliedTaskSeedVersion: TASK_SEED.version
  });
}

async function boot() {
  const stored = await ext.storage.local.get(Object.keys(DEFAULTS));
  state = { ...structuredClone(DEFAULTS), ...stored, settings: { ...DEFAULTS.settings, ...(stored.settings || {}) } };
  await applyTaskSeed();
  $("#date-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date());
  $("#work-start").value = state.settings.workStart;
  $("#work-end").value = state.settings.workEnd;
  if (!["focus5", "focus10", "focus15", "focus25"].includes(state.selectedMode)) state.selectedMode = "focus25";
  bindEvents();
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) state[key] = change.newValue;
    render();
    if (changes.activeSession?.newValue?.status === "complete") void recoverCompletedSession();
  });
  render();
  await recoverCompletedSession();
  tick = window.setInterval(updateTimer, 1000);
}

async function save(patch = {}) {
  state = { ...state, ...patch };
  await ext.storage.local.set(patch);
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => openTab(tab.dataset.tab)));
  $("#task-form").addEventListener("submit", addTask);
  $("#meeting-form").addEventListener("submit", addMeeting);
  $("#work-block-form").addEventListener("submit", addWorkBlock);
  $("#start-focus").addEventListener("click", startFocus);
  $("#end-focus").addEventListener("click", () => finishSession(true));
  $("#focus-minutes").addEventListener("change", (event) => selectMode("focus" + event.target.value));
  $("#reset-day").addEventListener("click", resetDay);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#reflection-dialog").addEventListener("close", saveReflection);
}

function openTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${name}-panel`));
}

async function addTask(event) {
  event.preventDefault();
  const title = $("#task-title").value.trim();
  if (!title) return;
  const task = { id: uid(), title, minutes: Number($("#task-minutes").value), project: $("#task-project").value.trim(), status: "inbox", createdAt: Date.now() };
  await save({ tasks: [...state.tasks, task], selectedTaskId: task.id });
  event.target.reset();
  $("#task-minutes").value = "25";
  render();
}

async function addMeeting(event) {
  event.preventDefault();
  const meeting = { id: uid(), title: $("#meeting-title").value.trim(), start: parseClock($("#meeting-time").value), minutes: Number($("#meeting-minutes").value), date: dayKey() };
  await save({ meetings: [...state.meetings, meeting] });
  event.target.reset();
  render();
}

async function addWorkBlock(event) {
  event.preventDefault();
  const title = $("#work-block-title").value.trim();
  const start = parseClock($("#work-time").value);
  const minutes = Number($("#work-minutes").value);
  if (!title || Number.isNaN(start)) return;
  const today = dayKey();
  const end = start + minutes;
  const occupied = [
    ...state.meetings.filter((meeting) => meeting.date === today).map((meeting) => ({ start: meeting.start, end: meeting.start + meeting.minutes })),
    ...state.workBlocks.filter((block) => block.date === today).map((block) => ({ start: block.start, end: block.start + block.minutes }))
  ];
  if (occupied.some((slot) => start < slot.end && end > slot.start)) {
    $("#work-block-note").textContent = "That overlaps an existing block. Choose another time.";
    return;
  }
  $("#work-block-note").textContent = "";
  await save({ workBlocks: [...state.workBlocks, { id: uid(), title, start, minutes, date: today }] });
  event.target.reset();
  $("#work-minutes").value = "25";
  render();
}

async function startFocus() {
  if (state.activeSession?.status === "running") return;
  const task = currentTask();
  if (!task) return;
  const kind = state.selectedMode;
  const duration = durationFor(kind);
  const session = { id: uid(), taskId: task?.id ?? null, kind, startedAt: Date.now(), endsAt: Date.now() + duration * 60_000, duration, status: "running" };
  await save({ activeSession: session });
  await ext.runtime.sendMessage({ type: "start-session", endsAt: session.endsAt });
  render();
}

async function selectMode(mode) {
  if (state.activeSession?.status === "running") return;
  await save({ selectedMode: mode });
  render();
}

function currentTask() {
  const active = state.activeSession && state.tasks.find((task) => task.id === state.activeSession.taskId);
  return active || state.tasks.find((task) => task.id === state.selectedTaskId && task.status !== "done");
}

async function finishSession(early = false) {
  if (!state.activeSession) return;
  const completed = { ...state.activeSession, status: "complete", endedAt: Date.now(), endedEarly: early };
  completingSessionId = completed.id;
  await save({ activeSession: completed });
  await ext.runtime.sendMessage({ type: "clear-session" });
  await finalizeCompletedSession(completed);
}

async function recoverCompletedSession() {
  const completed = state.activeSession;
  if (!completed || completed.status !== "complete" || completingSessionId === completed.id) return;
  completingSessionId = completed.id;
  await ext.runtime.sendMessage({ type: "clear-session" });
  await finalizeCompletedSession(completed);
}

async function finalizeCompletedSession(completed) {
  render();
  if (!$("#reflection-dialog").open) $("#reflection-dialog").showModal();
}

async function saveReflection() {
  const dialog = $("#reflection-dialog");
  if (dialog.returnValue !== "save" || !state.activeSession) {
    if (state.activeSession?.status === "complete") await save({ sessions: [...state.sessions, state.activeSession], activeSession: null });
    completingSessionId = null;
    render();
    return;
  }
  const task = currentTask();
  const reflection = { id: uid(), sessionId: state.activeSession.id, taskId: state.activeSession.taskId, progress: $("#reflection-progress").value.trim(), blocker: $("#reflection-blocker").value.trim(), next: $("#reflection-next").value.trim(), createdAt: Date.now() };
  let tasks = state.tasks;
  if (task && reflection.next) tasks = tasks.map((item) => item.id === task.id ? { ...item, nextAction: reflection.next } : item);
  await save({ sessions: [...state.sessions, state.activeSession], reflections: [...state.reflections, reflection], tasks, activeSession: null });
  completingSessionId = null;
  $("#reflection-form").reset();
  render();
}

async function resetDay() {
  const today = dayKey();
  await save({ workBlocks: state.workBlocks.filter((block) => block.date !== today) });
  render();
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = { ...state.settings, workStart: $("#work-start").value, workEnd: $("#work-end").value };
  await save({ settings });
  render();
}

function updateTimer() {
  if (state.activeSession?.status === "running" && state.activeSession.endsAt <= Date.now()) finishSession();
  renderTimerOnly();
}

function modeForEstimate(minutes) {
  if (minutes <= 5) return "focus5";
  if (minutes <= 10) return "focus10";
  if (minutes <= 15) return "focus15";
  return "focus25";
}

function renderTimerOnly() {
  const active = state.activeSession;
  const task = currentTask();
  const mode = active?.status === "running" ? active.kind : state.selectedMode;
  const remaining = active?.status === "running" ? Math.max(0, Math.ceil((active.endsAt - Date.now()) / 1000)) : durationFor(mode) * 60;
  const selectedMinutes = durationFor(mode);

  $("#timer").textContent = String(Math.floor(remaining / 60)).padStart(2, "0") + ":" + String(remaining % 60).padStart(2, "0");
  $("#session-label").textContent = active?.status === "running" ? "Block in progress" : "Timer";
  $("#focus-minutes").value = String(selectedMinutes);
  $("#focus-minutes").disabled = active?.status === "running";
  $("#selected-task-title").textContent = task?.title || "Choose a task below";
  $("#selected-task-action").textContent = task?.nextAction || (task ? "Choose the next physical action before starting." : "Your next action will stay here while you work.");
  $("#selected-task-meta").textContent = task ? task.minutes + " min estimate" + (task.project ? " · " + task.project : "") : "";
  $("#selected-task-card").classList.toggle("empty", !task);
  $("#selected-task-card").classList.toggle("running", active?.status === "running");
  $("#start-focus").textContent = task ? "Start " + selectedMinutes + " min" : "Choose a task";
  $("#start-focus").disabled = !task || active?.status === "running";
  $("#start-focus").hidden = active?.status === "running";
  $("#end-focus").hidden = active?.status !== "running";
}

function durationFor(mode) {
  return { focus5: 5, focus10: 10, focus15: 15, focus25: 25 }[mode] || 25;
}

function render() {
  renderTimerOnly();
  const today = dayKey();
  const items = [
    ...state.meetings.filter((meeting) => meeting.date === today).map((meeting) => ({ ...meeting, type: "meeting" })),
    ...state.workBlocks.filter((block) => block.date === today).map((block) => ({ ...block, type: "work" }))
  ].sort((a, b) => a.start - b.start);
  renderTimeline(items);
  renderTaskList();
  renderCompleted();
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteItem(button.dataset.delete, button.dataset.id)));
}

function renderTaskList() {
  const visibleTasks = state.tasks.filter((task) => task.status !== "done");
  $("#task-list").innerHTML = visibleTasks.map((task) => {
    const selected = task.id === state.selectedTaskId ? " selected" : "";
    const project = task.project ? " · " + escapeHtml(task.project) : "";
    return '<article class="task' + selected + '" draggable="true" data-drag-task="' + task.id + '"><span class="drag-handle" aria-hidden="true">⠿</span><input class="task-check" type="checkbox" data-complete="' + task.id + '" aria-label="Complete ' + escapeHtml(task.title) + '"/><div><p class="task-title">' + escapeHtml(task.title) + '</p><p class="task-detail">' + task.minutes + " min" + project + '</p></div><div class="task-actions"><button class="focus-task-button" data-focus-task="' + task.id + '">' + (task.id === state.selectedTaskId ? "Selected" : "Focus") + '</button><button class="icon-button" data-remove-task="' + task.id + '" aria-label="Delete ' + escapeHtml(task.title) + '">×</button></div></article>';
  }).join("") || '<p class="muted small">No active tasks.</p>';
  document.querySelectorAll("[data-complete]").forEach((box) => box.addEventListener("change", () => completeTask(box.dataset.complete, box.checked)));
  document.querySelectorAll("[data-focus-task]").forEach((button) => button.addEventListener("click", () => selectTask(button.dataset.focusTask)));
  document.querySelectorAll("[data-remove-task]").forEach((button) => button.addEventListener("click", () => removeTask(button.dataset.removeTask)));
  bindTaskReorder();
}

function bindTaskReorder() {
  document.querySelectorAll("[data-drag-task]").forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      draggedTaskId = item.dataset.dragTask;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedTaskId);
      item.classList.add("dragging");
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!draggedTaskId || draggedTaskId === item.dataset.dragTask) return;
      const before = event.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2;
      item.classList.toggle("drop-before", before);
      item.classList.toggle("drop-after", !before);
    });
    item.addEventListener("dragleave", () => item.classList.remove("drop-before", "drop-after"));
    item.addEventListener("drop", async (event) => {
      event.preventDefault();
      const sourceId = draggedTaskId || event.dataTransfer.getData("text/plain");
      const before = event.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2;
      await reorderTask(sourceId, item.dataset.dragTask, before);
    });
    item.addEventListener("dragend", () => {
      draggedTaskId = null;
      document.querySelectorAll("[data-drag-task]").forEach((row) => row.classList.remove("dragging", "drop-before", "drop-after"));
    });
  });
}

async function reorderTask(sourceId, targetId, before) {
  if (!sourceId || sourceId === targetId) return;
  const active = state.tasks.filter((task) => task.status !== "done");
  const sourceIndex = active.findIndex((task) => task.id === sourceId);
  let targetIndex = active.findIndex((task) => task.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [source] = active.splice(sourceIndex, 1);
  if (sourceIndex < targetIndex) targetIndex -= 1;
  active.splice(before ? targetIndex : targetIndex + 1, 0, source);
  let index = 0;
  await save({ tasks: state.tasks.map((task) => task.status === "done" ? task : active[index++]) });
  render();
}

function renderCompleted() {
  const completed = state.tasks.filter((task) => task.status === "done").sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  $("#completed-count").textContent = completed.length + " finished";
  $("#completed-list").innerHTML = completed.map((task) => {
    const project = task.project ? " · " + escapeHtml(task.project) : "";
    const when = task.completedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(task.completedAt)) : "Earlier";
    return '<article class="completed-task"><span class="completed-check">✓</span><div><p class="task-title">' + escapeHtml(task.title) + '</p><p class="task-detail">' + when + " · " + task.minutes + " min" + project + '</p></div><button class="secondary compact" data-restore-task="' + task.id + '">Restore</button></article>';
  }).join("") || '<p class="muted small">Finished tasks will appear here.</p>';
  document.querySelectorAll("[data-restore-task]").forEach((button) => button.addEventListener("click", () => completeTask(button.dataset.restoreTask, false)));
}

function renderTimeline(items) {
  const start = parseClock(state.settings.workStart);
  const end = parseClock(state.settings.workEnd);
  const total = Math.max(1, end - start);
  const firstHour = Math.ceil(start / 60) * 60;
  const ticks = [];
  for (let minute = firstHour; minute <= end; minute += 60) ticks.push(minute);
  const blocks = items
    .filter((item) => item.start < end && item.start + item.minutes > start)
    .map((item) => {
      const visibleStart = Math.max(start, item.start);
      const visibleEnd = Math.min(end, item.start + item.minutes);
      const top = ((visibleStart - start) / total) * 100;
      const height = Math.max(6, ((visibleEnd - visibleStart) / total) * 100);
      const kind = item.type === "meeting" ? "meeting" : "work";
      const meta = item.type === "meeting" ? "Committed" : item.minutes + " min work block";
      return '<article class="timeline-block ' + kind + '" style="top:' + top + '%;height:' + height + '%"><p>' + escapeHtml(item.title) + '</p><span>' + clock(item.start) + ' · ' + meta + '</span><button class="icon-button" data-delete="' + item.type + '" data-id="' + item.id + '" aria-label="Remove ' + escapeHtml(item.title) + '">×</button></article>';
    }).join("");
  const labels = ticks.map((minute) => '<span style="top:' + ((minute - start) / total) * 100 + '%">' + clock(minute) + '</span>').join("");
  const now = minutesAt(new Date());
  const nowMarker = now >= start && now <= end ? '<span class="timeline-now" style="top:' + ((now - start) / total) * 100 + '%">Now</span>' : "";
  $("#timeline").innerHTML = '<div class="timeline-canvas"><div class="timeline-labels">' + labels + '</div><div class="timeline-track">' + nowMarker + (blocks || '<p class="timeline-empty">Open time. Add a general work block when you want to protect time for it.</p>') + '</div></div>';
  if ($("#timeline").dataset.oriented !== dayKey()) {
    $("#timeline").scrollTop = Math.max(0, ((now - start) / total) * 510 - 120);
    $("#timeline").dataset.oriented = dayKey();
  }
}

async function selectTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status === "done") return;
  await save({ selectedTaskId: id, selectedMode: modeForEstimate(task.minutes) });
  render();
}

async function completeTask(id, checked) {
  const tasks = state.tasks.map((task) => task.id === id ? { ...task, status: checked ? "done" : "inbox", completedAt: checked ? Date.now() : null, scheduledFor: checked ? task.scheduledFor : null, start: checked ? task.start : null } : task);
  await save({ tasks });
  render();
}

async function removeTask(id) { await save({ tasks: state.tasks.filter((task) => task.id !== id), selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId }); render(); }
async function deleteItem(type, id) {
  if (type === "meeting") await save({ meetings: state.meetings.filter((meeting) => meeting.id !== id) });
  else await save({ workBlocks: state.workBlocks.filter((block) => block.id !== id) });
  render();
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

boot();

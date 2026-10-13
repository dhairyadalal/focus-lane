import { ext } from "./extension-api.js";
import { configurePlatform } from "./platform.js";

const ALARM = "focus-lane-session-end";

ext.runtime.onInstalled.addListener(async () => {
  await configurePlatform();
  await restoreAlarm();
});

ext.runtime.onStartup.addListener(restoreAlarm);

ext.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const { activeSession } = await ext.storage.local.get("activeSession");
  if (!activeSession || activeSession.endsAt > Date.now()) return;
  await ext.storage.local.set({
    activeSession: { ...activeSession, status: "complete", endedAt: Date.now() }
  });
});

ext.runtime.onMessage.addListener(async (message) => {
  if (message.type === "start-session") {
    await ext.alarms.create(ALARM, { when: message.endsAt });
  }
  if (message.type === "clear-session") {
    await ext.alarms.clear(ALARM);
  }
});

async function restoreAlarm() {
  const { activeSession } = await ext.storage.local.get("activeSession");
  if (!activeSession || activeSession.status !== "running") return;
  if (activeSession.endsAt <= Date.now()) {
    await ext.storage.local.set({ activeSession: { ...activeSession, status: "complete", endedAt: Date.now() } });
    return;
  }
  await ext.alarms.create(ALARM, { when: activeSession.endsAt });
}

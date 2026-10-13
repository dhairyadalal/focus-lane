import { ext } from "./extension-api.js";

export async function configurePlatform() {
  await ext.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

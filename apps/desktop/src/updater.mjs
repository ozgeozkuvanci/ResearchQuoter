import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { app, dialog } from "electron";
import updater from "electron-updater";

const { autoUpdater } = updater;
const checkEveryMs = 6 * 60 * 60 * 1000;

// New versions are published as GitHub releases (see "publish" in package.json). They download in
// the background; once one is ready the person can restart now, or it installs when they next quit.
export function startAutomaticUpdates(getWindow) {
  if (!app.isPackaged) return;
  const logRoot = path.join(app.getPath("userData"), "logs");
  const log = (message) => {
    try {
      mkdirSync(logRoot, { recursive: true });
      appendFileSync(path.join(logRoot, "updates.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
    } catch {
      // Logging must never stop the app.
    }
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => undefined };

  let asked = false;
  autoUpdater.on("update-downloaded", async (info) => {
    if (asked) return;
    asked = true;
    const window = getWindow();
    const options = {
      type: "info",
      buttons: ["Şimdi yeniden başlat", "Sonra"],
      defaultId: 0,
      cancelId: 1,
      title: "Güncelleme hazır",
      message: `Research Workspace ${info.version} indirildi.`,
      detail: "Yeniden başlattığınızda yeni sürüm kurulur. \"Sonra\" derseniz program kapanırken kurulur. Projeleriniz ve PDF'leriniz olduğu gibi kalır."
    };
    const { response } = window === undefined ? await dialog.showMessageBox(options) : await dialog.showMessageBox(window, options);
    if (response === 0) autoUpdater.quitAndInstall(true, true);
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((error) => log(`Update check failed: ${error instanceof Error ? error.message : String(error)}`));
  };
  check();
  setInterval(check, checkEveryMs).unref();
}

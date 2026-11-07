import { appendFileSync, mkdirSync, readFileSync, watchFile, writeFileSync } from "node:fs";
import path from "node:path";

import { app, dialog } from "electron";
import updater from "electron-updater";

const { autoUpdater } = updater;
const checkEveryMs = 6 * 60 * 60 * 1000;
// Same repository as "publish" in package.json.
const releases = { provider: "github", owner: "ozgeozkuvanci", repo: "researchquoter-releases" };

// The releases repository can be private: then the read-only GitHub token saved in Ayarlar
// (settings.json, written by the web app) is needed to see and download releases.
function readUpdateToken(settingsFile) {
  try {
    const token = JSON.parse(readFileSync(settingsFile, "utf8")).githubUpdateToken;
    return typeof token === "string" && token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

// New versions are published as GitHub releases. They download in the background; once one is
// ready the person can restart now, or it installs when they next quit.
// The latest outcome is written to updateStatusFile, which Ayarlar shows.
// beforeInstall stops whatever holds the installed files open.
export function startAutomaticUpdates(getWindow, settingsFile, updateStatusFile, beforeInstall) {
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

  const report = (message) => {
    try {
      writeFileSync(updateStatusFile, JSON.stringify({ message, at: new Date().toISOString() }), "utf8");
    } catch {
      // The status is informational only.
    }
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => undefined };

  autoUpdater.on("update-not-available", () => report(`Program güncel (sürüm ${app.getVersion()}).`));
  autoUpdater.on("update-available", (info) => report(`Yeni sürüm ${info.version} indiriliyor.`));
  autoUpdater.on("error", () => report(readUpdateToken(settingsFile) === undefined
    ? "Güncellemeler kontrol edilemedi. Güncelleme deposu gizliyse erişim anahtarını girin."
    : "Güncellemeler kontrol edilemedi. İnternet bağlantısını ve erişim anahtarını kontrol edin."));

  let asked = false;
  autoUpdater.on("update-downloaded", async (info) => {
    report(`Sürüm ${info.version} indirildi; program yeniden başlayınca kurulacak.`);
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
    if (response !== 0) return;
    log("Stopping services before installing the update");
    await beforeInstall();
    autoUpdater.quitAndInstall(true, true);
  });

  const check = () => {
    const token = readUpdateToken(settingsFile);
    autoUpdater.setFeedURL(token === undefined ? releases : { ...releases, private: true, token });
    autoUpdater.checkForUpdates().catch((error) => log(`Update check failed: ${error instanceof Error ? error.message : String(error)}`));
  };
  check();
  setInterval(check, checkEveryMs).unref();
  // Check again right after a token is saved, instead of waiting for the next round.
  let lastToken = readUpdateToken(settingsFile);
  watchFile(settingsFile, { interval: 5000 }, () => {
    const token = readUpdateToken(settingsFile);
    if (token !== lastToken && token !== undefined) check();
    lastToken = token;
  });
}

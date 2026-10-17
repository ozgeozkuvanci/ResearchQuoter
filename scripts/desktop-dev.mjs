import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(import.meta.dirname, "..");
const webRoot = resolve(workspaceRoot, "apps", "web");
const webUrl = "http://127.0.0.1:3210";
const nodeExecutable = process.execPath;
const nextExecutable = resolve(webRoot, "node_modules", "next", "dist", "bin", "next");
const electronCli = fileURLToPath(import.meta.resolve("electron/cli.js"));
const electronInstallScript = fileURLToPath(import.meta.resolve("electron/install.js"));
const electronExecutable = resolve(electronCli, "..", "dist", "electron.exe");

const childEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path")
);
childEnvironment.PATH = `${resolve(nodeExecutable, "..")};${process.env.PATH ?? process.env.Path ?? ""}`;
childEnvironment.RESEARCH_DESKTOP = "1";

if (!existsSync(electronExecutable)) {
  const installation = spawnSync(nodeExecutable, [electronInstallScript], {
    cwd: workspaceRoot,
    env: childEnvironment,
    stdio: "inherit",
    windowsHide: true
  });
  if (installation.status !== 0) {
    throw new Error("Electron could not be installed.");
  }
}

const webProcess = spawn(nodeExecutable, [nextExecutable, "dev", "-p", "3210"], {
  cwd: webRoot,
  env: childEnvironment,
  stdio: "inherit",
  windowsHide: true
});

async function waitForWebServer(timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (webProcess.exitCode !== null) {
      throw new Error(`Web process exited with code ${webProcess.exitCode}.`);
    }
    try {
      const response = await fetch(webUrl);
      if (response.ok) return;
    } catch {
      // The web server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Web server did not start in time.");
}

let desktopProcess;

function stopProcessTree(childProcess) {
  if (childProcess?.exitCode !== null || childProcess?.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(childProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }
  childProcess.kill("SIGTERM");
}

function stopChildren() {
  stopProcessTree(desktopProcess);
  stopProcessTree(webProcess);
}

process.once("SIGINT", stopChildren);
process.once("SIGTERM", stopChildren);
process.once("exit", stopChildren);

try {
  await waitForWebServer();
  desktopProcess = spawn(nodeExecutable, [electronCli, resolve(workspaceRoot, "apps", "desktop")], {
    cwd: workspaceRoot,
    env: { ...childEnvironment, RESEARCH_DESKTOP_URL: webUrl },
    stdio: "inherit",
    windowsHide: true
  });
  desktopProcess.once("exit", (code) => {
    stopProcessTree(webProcess);
    process.exitCode = code ?? 0;
  });
} catch (error) {
  stopChildren();
  throw error;
}

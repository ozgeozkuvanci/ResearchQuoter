import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, createWriteStream } from "node:fs";
import { access, appendFile, cp, mkdir, readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";

import { app, BrowserWindow, dialog, session, shell } from "electron";

let mainWindow;
let nextServer;
let applicationOrigin;
let managedDatabaseRoot;
let managedDatabaseControl;
let managedDatabaseStarted = false;
let desktopBootstrapLog;

app.setName("Research Workspace");
if (process.env.RESEARCH_DESKTOP_USER_DATA !== undefined) {
  app.setPath("userData", process.env.RESEARCH_DESKTOP_USER_DATA);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : undefined;
      server.close(() => {
        if (port === undefined) {
          reject(new Error("Could not allocate a local application port."));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForServer(url, timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (nextServer?.exitCode !== null && nextServer?.exitCode !== undefined) {
      throw new Error(`The local application server exited with code ${nextServer.exitCode}.`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The local application server did not start in time.");
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function runDatabaseCommand(executable, argumentsList, description, allowFailure = false, ignoreOutput = false) {
  if (desktopBootstrapLog !== undefined) {
    appendFileSync(desktopBootstrapLog, `${new Date().toISOString()} start ${description}\n`, "utf8");
  }
  const result = spawnSync(executable, argumentsList, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ignoreOutput ? "ignore" : "pipe",
    windowsHide: true
  });
  if (desktopBootstrapLog !== undefined) {
    const output = (result.stderr || result.stdout || result.error?.message || "").trim();
    appendFileSync(
      desktopBootstrapLog,
      `${new Date().toISOString()} finish ${description} status=${String(result.status)} ${output}\n`,
      "utf8"
    );
  }
  if (!allowFailure && (result.status !== 0 || result.error !== undefined)) {
    const details = (result.stderr || result.stdout || result.error?.message || "Unknown database error.").trim();
    throw new Error(`${description}: ${details}`);
  }
  return result;
}

async function seedPdfAssets(assetRoot) {
  const seedAssetRoot = path.join(process.resourcesPath, "seed", "assets");
  if (!(await pathExists(seedAssetRoot))) return;
  const currentAssets = await readdir(assetRoot);
  if (currentAssets.length === 0) {
    await cp(seedAssetRoot, assetRoot, { recursive: true });
  }
}

async function prepareApplicationDatabase(databasePort, psql, seedDatabase, seedSchema) {
  // The packaged web server already ships the PostgreSQL driver; reuse it instead of the psql/createdb tools.
  const webModules = createRequire(path.join(process.resourcesPath, "web", "apps", "web", "package.json"));
  const pg = webModules("pg");
  const adminClient = new pg.Client({ host: "127.0.0.1", port: databasePort, user: "postgres", database: "postgres" });
  await adminClient.connect();
  try {
    const existing = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = 'research_workspace'");
    if (existing.rowCount === 0) {
      await adminClient.query("CREATE DATABASE research_workspace");
    }
  } finally {
    await adminClient.end();
  }

  const client = new pg.Client({ host: "127.0.0.1", port: databasePort, user: "postgres", database: "research_workspace" });
  await client.connect();
  try {
    const schema = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AcademicProject'"
    );
    if (schema.rowCount === 1) return;

    // A full pg_dump seed needs psql for its COPY blocks; otherwise start from the empty schema.
    if ((await pathExists(seedDatabase)) && (await pathExists(psql))) {
      runDatabaseCommand(
        psql,
        ["-h", "127.0.0.1", "-p", String(databasePort), "-U", "postgres", "-d", "research_workspace", "-v", "ON_ERROR_STOP=1", "-f", seedDatabase],
        "The initial research data could not be restored"
      );
      return;
    }
    await client.query(await readFile(seedSchema, "utf8"));
  } finally {
    await client.end();
  }
}

async function ensureManagedDatabase(userDataRoot, logRoot) {
  desktopBootstrapLog = path.join(logRoot, "desktop-bootstrap.log");
  const databasePort = 55432;
  const postgresBin = path.join(process.resourcesPath, "postgresql", "bin");
  const initDb = path.join(postgresBin, "initdb.exe");
  const pgCtl = path.join(postgresBin, "pg_ctl.exe");
  const psql = path.join(postgresBin, "psql.exe");
  const clusterRoot = path.join(userDataRoot, "postgres-data");
  const databaseLog = path.join(logRoot, "postgres.log");
  const seedDatabase = path.join(process.resourcesPath, "seed", "database.sql");
  const seedSchema = path.join(process.resourcesPath, "seed", "schema.sql");
  const isInitialized = await pathExists(path.join(clusterRoot, "PG_VERSION"));

  if (!isInitialized) {
    await mkdir(clusterRoot, { recursive: true });
    runDatabaseCommand(
      initDb,
      ["-D", clusterRoot, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C"],
      "The local database could not be initialized"
    );
  }

  const status = runDatabaseCommand(pgCtl, ["status", "-D", clusterRoot], "Database status failed", true);
  if (status.status !== 0) {
    runDatabaseCommand(
      pgCtl,
      ["start", "-D", clusterRoot, "-l", databaseLog, "-o", `-p ${databasePort} -h 127.0.0.1`, "-w"],
      "The local database could not be started",
      false,
      true
    );
  }
  managedDatabaseStarted = true;

  await prepareApplicationDatabase(databasePort, psql, seedDatabase, seedSchema);

  managedDatabaseRoot = clusterRoot;
  managedDatabaseControl = pgCtl;
  return `postgresql://postgres@127.0.0.1:${databasePort}/research_workspace?schema=public`;
}

async function startPackagedServer() {
  const port = await getFreePort();
  const serverRoot = path.join(process.resourcesPath, "web");
  const serverScript = path.join(serverRoot, "apps", "web", "server.js");
  const userDataRoot = app.getPath("userData");
  const assetRoot = path.join(userDataRoot, "assets");
  const logRoot = path.join(userDataRoot, "logs");
  await Promise.all([mkdir(assetRoot, { recursive: true }), mkdir(logRoot, { recursive: true })]);
  await seedPdfAssets(assetRoot);

  const serverLog = createWriteStream(path.join(logRoot, "server.log"), { flags: "a" });
  const databaseUrl = process.env.DATABASE_URL ?? await ensureManagedDatabase(userDataRoot, logRoot);

  nextServer = spawn(process.execPath, [serverScript], {
    cwd: serverRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      LOCAL_ASSET_ROOT: assetRoot,
      NODE_ENV: "production",
      PORT: String(port),
      RESEARCH_DESKTOP: "1"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  nextServer.stdout.pipe(serverLog, { end: false });
  nextServer.stderr.pipe(serverLog, { end: false });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

function isApplicationUrl(url) {
  try {
    return new URL(url).origin === applicationOrigin;
  } catch {
    return false;
  }
}

function secureWindowOptions() {
  return {
    backgroundColor: "#f5f3ec",
    height: 900,
    minHeight: 700,
    minWidth: 1000,
    show: true,
    title: "Research Workspace",
    width: 1440,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  };
}

async function createMainWindow() {
  const startUrl = app.isPackaged
    ? await startPackagedServer()
    : process.env.RESEARCH_DESKTOP_URL ?? "http://127.0.0.1:3210";
  applicationOrigin = new URL(startUrl).origin;

  mainWindow = new BrowserWindow(secureWindowOptions());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isApplicationUrl(url)) {
      return { action: "allow", overrideBrowserWindowOptions: secureWindowOptions() };
    }
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isApplicationUrl(url)) {
      event.preventDefault();
    }
  });

  await mainWindow.loadURL(startUrl);
  mainWindow.show();
  mainWindow.focus();
}

app.on("second-instance", () => {
  if (mainWindow !== undefined) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  app.setAppUserModelId("com.researchworkspace.desktop");
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  try {
    await createMainWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const logRoot = path.join(app.getPath("userData"), "logs");
    await mkdir(logRoot, { recursive: true });
    await appendFile(path.join(logRoot, "desktop-error.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
    dialog.showErrorBox("Research Workspace could not start", message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (nextServer !== undefined && nextServer.exitCode === null) {
    nextServer.kill();
  }
  if (managedDatabaseStarted && managedDatabaseControl !== undefined && managedDatabaseRoot !== undefined) {
    runDatabaseCommand(
      managedDatabaseControl,
      ["stop", "-D", managedDatabaseRoot, "-m", "fast", "-w"],
      "The local database could not be stopped",
      true
    );
    managedDatabaseStarted = false;
  }
});

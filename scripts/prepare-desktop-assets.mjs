import { access, cp, lstat, mkdir, readdir, realpath, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const webRoot = resolve(workspaceRoot, "apps", "web");
const standaloneRoot = resolve(webRoot, ".next", "standalone");
const targetStaticRoot = resolve(standaloneRoot, "apps", "web", ".next", "static");
const tracedNodeModules = resolve(standaloneRoot, "node_modules");
const packagedNodeModules = resolve(standaloneRoot, "apps", "web", "node_modules");
const desktopVendorRoot = resolve(workspaceRoot, "apps", "desktop", "vendor");
const postgresDownloadRoot = resolve(workspaceRoot, ".desktop-cache", "postgresql");
const postgresPackage = "@embedded-postgres/windows-x64@17.10.0-beta.17";
const postgresTargetRoot = resolve(desktopVendorRoot, "postgresql");
const seedTargetRoot = resolve(desktopVendorRoot, "seed");
const schemaMigration = resolve(workspaceRoot, "packages", "db", "prisma", "migrations", "20260710235500_init", "migration.sql");
// Optional private seed data (a pg_dump file and PDF assets) copied into the installer when present.
const databaseBackup = process.env.RESEARCH_SEED_SQL;
const localAssets = resolve(workspaceRoot, ".local-assets");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

await rm(targetStaticRoot, { force: true, recursive: true });
await mkdir(targetStaticRoot, { recursive: true });
await cp(resolve(webRoot, ".next", "static"), targetStaticRoot, { recursive: true });

// Next.js links hashed external packages into .next/node_modules; replace those links with real
// copies before the pnpm store they point into is removed, so the installer has no dangling links.
async function materializeLinks(directory) {
  if (!(await exists(directory))) return;
  for (const entry of await readdir(directory)) {
    const entryPath = resolve(directory, entry);
    const stats = await lstat(entryPath);
    if (stats.isSymbolicLink()) {
      const target = await realpath(entryPath);
      await rm(entryPath, { force: true, recursive: true });
      await cp(target, entryPath, { dereference: true, recursive: true });
    } else if (stats.isDirectory() && entry.startsWith("@")) {
      await materializeLinks(entryPath);
    }
  }
}
await materializeLinks(resolve(standaloneRoot, "apps", "web", ".next", "node_modules"));

await rm(packagedNodeModules, { force: true, recursive: true });
await cp(tracedNodeModules, packagedNodeModules, { dereference: true, recursive: true });
await rm(resolve(standaloneRoot, "node_modules"), { force: true, recursive: true });

// POSTGRES_HOME may point at an installed PostgreSQL 17; otherwise download portable Windows binaries once.
async function resolvePostgresSource() {
  if (process.env.POSTGRES_HOME !== undefined) return process.env.POSTGRES_HOME;
  const nativeRoot = resolve(postgresDownloadRoot, "package", "native");
  if (!(await exists(resolve(nativeRoot, "bin", "postgres.exe")))) {
    await rm(postgresDownloadRoot, { force: true, recursive: true });
    await mkdir(postgresDownloadRoot, { recursive: true });
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const tarball = execFileSync(npm, ["pack", postgresPackage, "--silent"], {
      cwd: postgresDownloadRoot,
      encoding: "utf8",
      shell: process.platform === "win32"
    }).trim();
    execFileSync("tar", ["-xzf", tarball], { cwd: postgresDownloadRoot });
  }
  return nativeRoot;
}

const postgresSourceRoot = await resolvePostgresSource();

await Promise.all([
  access(resolve(postgresSourceRoot, "bin", "postgres.exe")),
  access(resolve(postgresSourceRoot, "lib")),
  access(resolve(postgresSourceRoot, "share"))
]);

await rm(desktopVendorRoot, { force: true, recursive: true });
await Promise.all([mkdir(postgresTargetRoot, { recursive: true }), mkdir(seedTargetRoot, { recursive: true })]);
await Promise.all(
  ["bin", "lib", "share"].map((folder) =>
    cp(resolve(postgresSourceRoot, folder), resolve(postgresTargetRoot, folder), { recursive: true })
  )
);
for (const license of ["server_license.txt", "commandlinetools_3rd_party_licenses.txt"]) {
  if (await exists(resolve(postgresSourceRoot, license))) {
    await cp(resolve(postgresSourceRoot, license), resolve(postgresTargetRoot, license));
  }
}
await cp(schemaMigration, resolve(seedTargetRoot, "schema.sql"));
if (databaseBackup !== undefined) {
  await cp(databaseBackup, resolve(seedTargetRoot, "database.sql"));
}
if (await exists(localAssets)) {
  await cp(localAssets, resolve(seedTargetRoot, "assets"), { recursive: true });
}

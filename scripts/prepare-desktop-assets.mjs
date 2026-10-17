import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const webRoot = resolve(workspaceRoot, "apps", "web");
const standaloneRoot = resolve(webRoot, ".next", "standalone");
const targetStaticRoot = resolve(standaloneRoot, "apps", "web", ".next", "static");
const tracedNodeModules = resolve(standaloneRoot, "node_modules", ".pnpm", "node_modules");
const packagedNodeModules = resolve(standaloneRoot, "apps", "web", "node_modules");
const desktopVendorRoot = resolve(workspaceRoot, "apps", "desktop", "vendor");
const postgresSourceRoot = process.env.POSTGRES_HOME ?? "C:\\Program Files\\PostgreSQL\\17";
const postgresTargetRoot = resolve(desktopVendorRoot, "postgresql");
const seedTargetRoot = resolve(desktopVendorRoot, "seed");
const databaseBackup = resolve(workspaceRoot, "transfer-staging-20260711-044654", "database.sql");
const localAssets = resolve(workspaceRoot, ".local-assets");

await rm(targetStaticRoot, { force: true, recursive: true });
await mkdir(targetStaticRoot, { recursive: true });
await cp(resolve(webRoot, ".next", "static"), targetStaticRoot, { recursive: true });

await rm(packagedNodeModules, { force: true, recursive: true });
await cp(tracedNodeModules, packagedNodeModules, { dereference: true, recursive: true });
await rm(resolve(standaloneRoot, "node_modules"), { force: true, recursive: true });

await Promise.all([
  access(resolve(postgresSourceRoot, "bin", "postgres.exe")),
  access(resolve(postgresSourceRoot, "lib")),
  access(resolve(postgresSourceRoot, "share")),
  access(databaseBackup)
]);

await rm(desktopVendorRoot, { force: true, recursive: true });
await Promise.all([mkdir(postgresTargetRoot, { recursive: true }), mkdir(seedTargetRoot, { recursive: true })]);
await Promise.all([
  cp(resolve(postgresSourceRoot, "bin"), resolve(postgresTargetRoot, "bin"), { recursive: true }),
  cp(resolve(postgresSourceRoot, "lib"), resolve(postgresTargetRoot, "lib"), { recursive: true }),
  cp(resolve(postgresSourceRoot, "share"), resolve(postgresTargetRoot, "share"), { recursive: true }),
  cp(resolve(postgresSourceRoot, "server_license.txt"), resolve(postgresTargetRoot, "server_license.txt")),
  cp(
    resolve(postgresSourceRoot, "commandlinetools_3rd_party_licenses.txt"),
    resolve(postgresTargetRoot, "commandlinetools_3rd_party_licenses.txt")
  ),
  cp(databaseBackup, resolve(seedTargetRoot, "database.sql")),
  cp(localAssets, resolve(seedTargetRoot, "assets"), { recursive: true })
]);

# ResearchQuoter

## Windows desktop app

Build the installer on any machine with Node 22 and pnpm (Linux needs `wine` for the NSIS step):

```sh
pnpm install --frozen-lockfile
DATABASE_URL=postgresql://x@127.0.0.1/x SHADOW_DATABASE_URL=postgresql://x@127.0.0.1/y pnpm db:generate
pnpm desktop:dist
```

The installer lands in `dist/desktop/Research-Workspace-Setup-<version>.exe`. It bundles portable PostgreSQL 17
binaries (downloaded once into `.desktop-cache/`, or taken from `POSTGRES_HOME`) and starts with an empty
database on first launch. Set `RESEARCH_SEED_SQL` to a `pg_dump` file to ship existing data instead.
The `Desktop installer` GitHub Actions workflow builds the same installer on Windows.

### Updates

Installed copies check the public `ozgeozkuvanci/researchquoter-releases` repository for new GitHub
releases, download them in the background and offer to restart. To publish one, raise `version` in
`apps/desktop/package.json` and run `pnpm desktop:release` with a `GH_TOKEN` that can write releases to that
repository. On start the app applies any Prisma migrations its database has not had yet, so schema changes
reach existing installs; projects and PDFs stay in the user data folder across updates.

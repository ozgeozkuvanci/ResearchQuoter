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

Installed copies check the `ozgeozkuvanci/researchquoter-releases` repository for new GitHub releases,
download them in the background and offer to restart. While that repository is private, each computer
needs a fine-grained GitHub token with read-only Contents access to it, saved once in Ayarlar. To publish one, raise `version` in
`apps/desktop/package.json`, run `pnpm desktop:dist`, and push `latest.yml`, the `.blockmap` and the installer
split into parts under 100 MB (`split -b 75M -d -a 2 <exe> <exe>.part`) to `release/` on a `staging/v<version>`
branch of that repository, with release notes in `NOTES.md`. Its workflow joins the parts, publishes the
release and deletes the branch. On start the app applies any Prisma migrations its database has not had
yet, so schema changes reach existing installs; projects and PDFs stay in the user data folder across updates.

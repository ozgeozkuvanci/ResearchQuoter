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

# Architecture

## Overview

```
┌────────────┐  HTTPS   ┌─────────────────────────┐   node:sqlite   ┌───────────┐
│  PWA (web) │ ───────▶ │  API (server/src)       │ ──────────────▶ │  SQLite   │
│ React + d3 │ ◀─────── │  auth · workspaces ·    │                 │  per-     │
│ service wk │   JSON   │  contacts · imports ·   │                 │  install  │
└────────────┘          │  connectors             │                 └───────────┘
                        └─────────┬───────────────┘
                                  │ fetch / TLS
                     IMAP · Gmail · Graph · X · Facebook · LinkedIn
```

- **No web framework / ORM.** `server/src/http.ts` is a ~250-line router with JSON bodies, cookies, static files and SPA fallback. SQL is written directly against `node:sqlite` (`server/src/db.ts`, `repo.ts`).
- **Shared code.** `shared/src` holds the domain types, all file parsers and the graph analytics used by both the API and the browser (the import wizard detects sources client-side with the same code the server uses to parse).
- **Build.** esbuild bundles the web app into `dist/web` (hashed assets, inline-generated service worker precache list) and the server into `dist/server/server.js`. No bundler config files.

## Data model

| Table | Notes |
|---|---|
| `users` | scrypt password hashes |
| `workspaces`, `workspace_members`, `invites` | multi-tenant; roles owner/editor/viewer |
| `contacts` | one row per person; `is_self` marks the owner node; `merged_into` keeps merge history; `categories` is the effective circle set, `category_overrides` the manual one |
| `contact_sources` | one row per (person, source, external id) — a person imported from LinkedIn and Facebook has two |
| `relationships` | edges with `kind` (circle) and `origin` (source / employer / email / manual); self → person edges plus derived person ↔ person edges |
| `interactions` | email messages and logged events, deduplicated by `dedupe_key` |
| `integrations` | provider config (plain JSON) + `secrets_enc` (AES-256-GCM) |
| `import_jobs` | history and stats |

## Import pipeline

1. **Parse** (`shared/src/importers`) → `ImportResult { contacts, interactions, warnings }`. Pure functions, unit-tested.
2. **Reconcile** (`server/src/reconcile.ts`):
   - build an in-memory index of existing people (external ids, emails, handles, normalised names);
   - create or merge each imported person; attach a `contact_sources` row;
   - record interactions (dedupe key = thread + time + person + direction);
   - recompute circles (`inferCategories`) and strength (`computeStrength`) for touched people;
   - rebuild self → person edges per circle, star-shaped same-employer edges, and same-thread edges.
3. Every write is wrapped in one transaction per import.

## Security

- Sessions: HS256 JWT in an `HttpOnly; SameSite=Lax` cookie (Secure when behind HTTPS).
- Passwords: scrypt (N=16384) with per-user salt.
- Integration secrets: AES-256-GCM with a server key; never returned by the API.
- Every workspace route checks membership and minimum role.
- Request bodies are capped (256 MB) to allow large mailbox exports.

## Front end

- React 19 with a hand-rolled router and data hooks (no Redux/Query dependency).
- Material 3 tokens in `web/src/styles.css`; colour roles generated at runtime from a seed via CIELAB tonal palettes (`web/src/theme/color.ts`) as a close stand-in for HCT.
- Visualisations in `web/src/viz`: the force graph renders on canvas (d3-force + d3-zoom + hit-testing with `simulation.find`); the Venn diagram composes regions on an offscreen canvas; chord/Sankey/treemap/radial use d3 layouts rendered as SVG in React.
- Service worker (`web/src/sw.ts`): precache app shell, network-first API GETs with cache fallback, on-demand cache for training media.

## Testing

- `npm test` — importer unit tests (`node --test`).
- `npm run test:e2e` — Playwright with a throw-away database; `e2e/helpers.ts` seeds through the API and adopts the session cookie so UI tests start signed-in.
- Training videos double as smoke tests: `npm run training:record` drives every major flow.

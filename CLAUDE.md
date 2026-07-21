# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based admin UI for any database exposed by `@tangerie/remote-sqlite/server`. It's a pure frontend (Deno + Vite + Preact) that connects over WebSocket to a remote SQLite server and lets you browse tables/views, page & search rows, and run arbitrary SQL. There is no backend code in this repo — the server half lives in the `@tangerie/remote-sqlite` package (JSR).

## Commands

```sh
deno task dev      # start Vite dev server on :5173
deno task build    # production build -> dist/
deno task preview  # preview the production build locally
deno fmt            # format (no dedicated task, use Deno's built-in)
deno lint           # lint (no dedicated task, use Deno's built-in)
```

There is no test suite in this repo currently.

## Architecture

Everything routes through one store built with `jsr:@tangerie/global-store`: [src/state/store.ts](src/state/store.ts) — a single `createStore({ state, actions })` holding connection state, selected table, pagination, search, and query results. Components subscribe field-by-field via the exported `useStore` hook (e.g. `useStore((s) => s.tables)`), which re-renders only when that specific selected value changes, rather than receiving props or using context. Async actions (`connectTo`, `loadTable`, `refreshTableRows`, `executeQuery`) live in the store as entries in its `actions` map, re-exported by name (e.g. `connectTo`), not defined in components.

Data access is isolated in [src/modules/db.ts](src/modules/db.ts), a thin wrapper around `RemoteDatabase` from `@tangerie/remote-sqlite/client`. All SQL identifiers (table/column names) are quoted via [src/modules/sqlIdent.ts](src/modules/sqlIdent.ts)'s `quoteIdent` since they can't be parameter-bound; all values (search terms, LIMIT/OFFSET) go through bound `?` params. The one exception is `runQuery`, which sends user-typed SQL from the "Run SQL" tab verbatim — that's the intended behavior, not an injection bug.

Component tree: once connected, `App` shows `ConnectionBar` (WS URL entry) + `TabBar`, then one of three tabs from `s.activeTab`: `structure` → `StructureView` (tables/views expand to columns, indexes/triggers show their CREATE SQL), `browse` → `Sidebar` (table list, only mounted here) + `TableBrowser`, `query` → `QueryRunner` (its editor is `SqlEditor`, a CodeMirror 6 wrapper giving SQLite syntax highlighting and schema-aware autocomplete fed by `s.schemaMap` — table/view → column names loaded on connect via `getSchemaMap`; plus an Explain button rendering `EXPLAIN QUERY PLAN` as a tree). `ResultsTable` is shared by `TableBrowser` and `QueryRunner`; its cells truncate and, when clicked, populate `s.selectedCell`, which the docked `CellInspector` panel renders — as a `JsonTree` when the value parses as JSON, otherwise raw text.

The WebSocket URL and recent-connection history persist to `localStorage` (see the top of store.ts) — there's no server-side session.

## Conventions

- Preact, not React — shared state lives in the `jsr:@tangerie/global-store` store (`src/state/store.ts`), read via its `useStore` selector hook, not `useState`/context.
- JSX uses `class` not `className` (Preact).
- Tailwind v4 via `@tailwindcss/vite`, utility classes inline, no separate component stylesheets.
- Deno-style imports: bare specifiers resolved through `deno.json` `imports`, relative imports use explicit `.ts`/`.tsx` extensions.

## Deployment

Docker multi-stage build: `deno task build` in the build stage, then the runtime stage serves the static `dist/` output with `deno serve`. `docker-compose.yml` wires it behind Traefik under the `/sqlite` path prefix (see the `traefik-labels` skill for label conventions) — the app itself serves plain routes and relies on Traefik's `stripprefix` middleware.

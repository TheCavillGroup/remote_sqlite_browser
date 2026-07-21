# Remote SQLite Browser

A browser-based admin/browser UI for any database exposed by `@tangerie/remote-sqlite/server`

## What you can do

- Browse tables (and views) and their column schemas in the sidebar.
- Page through a table's rows and search/filter across its columns.
- Run arbitrary SQL via the "Run SQL" tab and see results or errors.

## Build

```sh
deno task build   # outputs to browser/dist
deno task preview # preview the production build locally
```

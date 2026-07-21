import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import deno from "@deno/vite-plugin";

export default defineConfig(({ command }) => ({
  // In prod the app is served behind Traefik under /sqlite (which stripprefixes back to /),
  // so built asset URLs must be prefixed with /sqlite/ or the browser requests them at the
  // domain root and Traefik 404s them. Dev server stays at root.
  base: command === "build" ? "/sqlite/" : "/",
  plugins: [deno(), preact(), tailwindcss()],
  server: { port: 5173 },
  resolve: {
    alias: [
      // jsr:@tangerie/global-store's hooks.ts imports "npm:preact@^10.27.0/hooks" as a
      // fully-qualified specifier rather than a bare one. @deno/vite-plugin resolves that
      // correctly for the dev server (esbuild), but Rollup's production build resolves it
      // to preact's root export instead of the ./hooks subpath. Alias it to our own
      // already-working "preact/hooks" bare specifier so both build modes agree.
      { find: "npm:preact@^10.27.0/hooks", replacement: "preact/hooks" },
    ],
  },
}));

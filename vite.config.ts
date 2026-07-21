import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
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
});

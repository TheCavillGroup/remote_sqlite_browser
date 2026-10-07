import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import deno from "@deno/vite-plugin";

export default defineConfig(({ command }) => ({
    // Served behind traefik at /sqlite with stripprefix, so built assets need the prefix
    base: command === "build" ? "/sqlite/" : "/",
    plugins: [deno(), preact(), tailwindcss()],
    server: { port: 5173 },
    resolve: {
        alias: [
            // global-store imports "npm:preact@^10.27.0/hooks" which rollup resolves to the preact root in prod builds
            { find: "npm:/preact@^10.29.8/hooks", replacement: "preact/hooks" }
        ]
    }
}));

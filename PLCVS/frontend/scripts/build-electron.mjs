/**
 * Compiles Electron main + preload TypeScript files to JavaScript
 * using esbuild (already bundled with Vite).
 */

import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function compile() {
  // Build main process
  await build({
    entryPoints: [path.join(root, "electron/main.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: path.join(root, "electron-dist/main.cjs"),
    external: ["electron"],
    format: "cjs",
    sourcemap: true,
  });

  // Build preload script
  await build({
    entryPoints: [path.join(root, "electron/preload.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: path.join(root, "electron-dist/preload.cjs"),
    external: ["electron"],
    format: "cjs",
    sourcemap: true,
  });

  console.log("✅ Electron main + preload compiled to electron-dist/");
}

compile().catch((err) => {
  console.error("❌ Electron build failed:", err);
  process.exit(1);
});

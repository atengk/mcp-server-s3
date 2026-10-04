/**
 * tsup 单文件打包构建配置
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  shims: true,
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  bundle: true,
  noExternal: [/.*/],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: `#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module";\nconst require = __cr(import.meta.url);`,
  },
});

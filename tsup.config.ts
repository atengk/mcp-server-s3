/**
 * tsup 单文件打包构建配置
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { defineConfig } from "tsup";

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
  banner: {
    js: `#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module";\nconst require = __cr(import.meta.url);`,
  },
});

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: [resolve(import.meta.dirname, "test/setup.ts")],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: ["lib/**/*.ts", "app/lib/**/*.ts"],
      exclude: ["lib/**/*.d.ts"],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 80,
      },
    },
  },
});

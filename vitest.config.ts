import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/web/lib/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true
  }
});

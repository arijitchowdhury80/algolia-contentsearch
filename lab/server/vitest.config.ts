import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests live alongside the source they cover (src/*.test.ts), unlike the
    // judge package's test/ dir layout.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          APP_ENV: "test",
          APP_ORIGIN: "https://app.test",
          SESSION_SECRET:
            "test-secret-with-at-least-32-random-bytes-only-for-tests",
          TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
          TEST_MIGRATIONS: await readD1Migrations("./db/migrations"),
        },
      },
    })),
  ],
  test: {
    include: ["tests/worker/**/*.test.ts"],
    setupFiles: ["./tests/worker/setup.ts"],
    fileParallelism: false,
  },
});

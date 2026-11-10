import type { Env as AppEnv } from "../worker/src/env";
declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
    }
  }
}
declare module "*?arraybuffer" {
  const data: ArrayBuffer;
  export default data;
}

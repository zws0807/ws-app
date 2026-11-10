import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
test("local setup creates a private random secret and never overwrites existing configuration", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-setup-"));
  try {
    const run = () =>
      spawnSync(process.execPath, [resolve("scripts/setup-local.mjs")], {
        cwd: dir,
        encoding: "utf8",
      });
    assert.equal(run().status, 0);
    const first = readFileSync(join(dir, ".dev.vars"), "utf8");
    assert.match(first, /SESSION_SECRET=[a-f0-9]{64}/);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(join(dir, ".dev.vars"), "utf8"), first);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

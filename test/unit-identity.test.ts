import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseUnitBlock, parseWhen, routineDue, upsertUnitBlock } from "../lib/unit-identity.ts";
import { loadHarnessUnit, saveHarnessUnit } from "../lib/unit-harness.ts";

test("daily and interval when-specs, and due only after arming", () => {
  assert.deepEqual(parseWhen("03:30 daily"), { kind: "daily", hour: 3, minute: 30 });
  assert.deepEqual(parseWhen("every 30m"), { kind: "every", ms: 30 * 60_000 });
  assert.equal(parseWhen("whenever").kind, "none");
  const row = { id: "r1", title: "Scan", when: "03:30", loop: "scan" as const, enabled: true, lastFire: 0 };
  const morning = Date.parse("2026-09-21T07:00:00");
  assert.equal(routineDue(row, morning), false);
  row.lastFire = Date.parse("2026-09-20T20:00:00");
  assert.equal(routineDue(row, Date.parse("2026-09-21T03:29:00")), false);
  assert.equal(routineDue(row, Date.parse("2026-09-21T03:30:00")), true);
});

test("identity upsert keeps existing body and round-trips soul/routines", () => {
  const source = "# Ares\n\nKeep this standing law.\n";
  const next = upsertUnitBlock(source, {
    soul: "Hold the line.",
    directive: "Scan at dawn.",
    routines: [{ id: "r0", title: "Dawn scan", when: "03:30 daily", loop: "scan", enabled: true, lastFire: 1 }],
  });
  assert.match(next, /Keep this standing law/);
  const parsed = parseUnitBlock(next);
  assert.equal(parsed?.soul, "Hold the line.");
  assert.equal(parsed?.directive, "Scan at dawn.");
  assert.equal(parsed?.routines[0]?.loop, "scan");
  assert.equal(parsed?.routines[0]?.when, "03:30 daily");
});

test("harness write maps to identities/<name>.md without clobbering the rest", () => {
  const home = mkdtempSync(join(tmpdir(), "klaud-unit-"));
  mkdirSync(join(home, "klaud"), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, "klaud", "bots.json"), JSON.stringify({ version: 1, bots: [{ id: "klaud-bot-a5e5a5e5", name: "Ares" }] }), { mode: 0o600 });
  mkdirSync(join(home, "klaud", "identities"), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, "klaud", "identities", "Ares.md"), "# Ares\n\nExisting identity.\n", { mode: 0o600 });
  saveHarnessUnit("klaud-bot-a5e5a5e5", {
    soul: "Field unit.",
    directive: "Stay local.",
    routines: [{ id: "r0", title: "Watch", when: "every 15m", loop: "watch", enabled: true, lastFire: 9 }],
  }, home);
  const loaded = loadHarnessUnit("klaud-bot-a5e5a5e5", home);
  assert.equal(loaded?.soul, "Field unit.");
  assert.equal(loaded?.directive, "Stay local.");
  assert.equal(loaded?.routines[0]?.lastFire, 9);
  const raw = readFileSync(join(home, "klaud", "identities", "Ares.md"), "utf8");
  assert.match(raw, /Existing identity/);
  assert.match(raw, /klaudbot:unit:start/);
});

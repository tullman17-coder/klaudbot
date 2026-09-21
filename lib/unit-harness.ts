import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseUnitBlock, upsertUnitBlock } from "./unit-identity.ts";
import { normalizeUnit, type UnitProfile, type UnitRoutine } from "./unit-profile.ts";

export const BOT_ID = /^klaud-bot-[0-9a-f]{8}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,63}$/;
const MAX_IDENTITY = 20_000;

export function reinHome(override?: string): string {
  return resolve(override || process.env.REIN_HOME || join(homedir(), ".rein"));
}

function identityPath(home: string, name: string): string {
  return join(home, "klaud", "identities", `${name}.md`);
}

function botsPath(home: string): string {
  return join(home, "klaud", "bots.json");
}

function unitStatePath(home: string, id: string): string {
  return join(home, "klaud", "bots", id, "unit.json");
}

export function botNameFor(id: string, home?: string): string | null {
  if (!BOT_ID.test(id)) return null;
  try {
    const raw = JSON.parse(readFileSync(botsPath(reinHome(home)), "utf8")) as { bots?: Array<{ id?: string; name?: string }> };
    const bot = Array.isArray(raw.bots) ? raw.bots.find(item => item.id === id) : undefined;
    const name = typeof bot?.name === "string" ? bot.name.trim() : "";
    return NAME.test(name) ? name : null;
  } catch {
    return null;
  }
}

function readIdentity(home: string, name: string): string {
  try { return readFileSync(identityPath(home, name), "utf8"); }
  catch { return ""; }
}

function readState(home: string, id: string): { lastFire: Record<string, number> } {
  try {
    const raw = JSON.parse(readFileSync(unitStatePath(home, id), "utf8")) as { lastFire?: Record<string, number> };
    const lastFire = raw.lastFire && typeof raw.lastFire === "object" ? raw.lastFire : {};
    return { lastFire: Object.fromEntries(Object.entries(lastFire).filter(([, value]) => typeof value === "number" && Number.isFinite(value))) };
  } catch {
    return { lastFire: {} };
  }
}

export function loadHarnessUnit(id: string, home?: string): { soul: string; directive: string; routines: UnitRoutine[] } | null {
  const root = reinHome(home);
  const name = botNameFor(id, root);
  if (!name) return null;
  const parsed = parseUnitBlock(readIdentity(root, name));
  const state = readState(root, id);
  const routines = (parsed?.routines ?? []).map(row => ({ ...row, lastFire: state.lastFire[row.id] ?? row.lastFire ?? 0 }));
  return { soul: parsed?.soul ?? "", directive: parsed?.directive ?? "", routines };
}

export function saveHarnessUnit(id: string, profile: Pick<UnitProfile, "soul" | "directive" | "routines">, home?: string): UnitProfile {
  const root = reinHome(home);
  const name = botNameFor(id, root);
  if (!name) throw new Error("Unknown field unit.");
  const next = normalizeUnit(profile);
  let text = upsertUnitBlock(readIdentity(root, name), next);
  if (text.length > MAX_IDENTITY) {
    next.soul = next.soul.slice(0, Math.max(0, next.soul.length - (text.length - MAX_IDENTITY)));
    text = upsertUnitBlock(readIdentity(root, name), next);
  }
  if (text.length > MAX_IDENTITY) throw new Error("Identity is too large for the harness.");
  mkdirSync(join(root, "klaud", "identities"), { recursive: true, mode: 0o700 });
  mkdirSync(join(root, "klaud", "bots", id), { recursive: true, mode: 0o700 });
  writeFileSync(identityPath(root, name), text, { mode: 0o600 });
  writeFileSync(unitStatePath(root, id), `${JSON.stringify({ version: 1, lastFire: Object.fromEntries(next.routines.map(row => [row.id, row.lastFire ?? 0])) }, null, 2)}\n`, { mode: 0o600 });
  return next;
}

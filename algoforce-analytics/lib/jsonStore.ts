// lib/jsonStore.ts
import { promises as fs } from "fs";
import path from "path";

export type Strategy = "Charm" | "Janus" | "None";

export interface Account {
  binanceName: string;
  redisName: string; // unique id
  dbName?: string | null;
  strategy: Strategy;
  leverage: number;
  monitored: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export type NewAccount = Omit<Account, "createdAt" | "updatedAt">;
export type AccountPatch = Partial<
  Omit<Account, "redisName" | "createdAt" | "updatedAt">
>;

const DATA_PATH = path.join(process.cwd(), "app", "data", "account.json");

// ---- in-process mutex to serialize writes
let queue: Promise<void> = Promise.resolve();
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

// ---- IO helpers
async function ensureFile(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.access(DATA_PATH);
  } catch {
    await fs.writeFile(DATA_PATH, "[]\n", "utf8");
  }
}

async function readRaw(): Promise<unknown> {
  await ensureFile();
  const txt = await fs.readFile(DATA_PATH, "utf8");
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error("account.json is not valid JSON");
  }
}

async function writeRaw(accounts: Account[]): Promise<void> {
  const tmp = `${DATA_PATH}.tmp`;
  const payload = JSON.stringify(accounts, null, 2) + "\n";
  await fs.writeFile(tmp, payload, "utf8");
  await fs.rename(tmp, DATA_PATH);
}

// ---- validation / normalization
function isStrategy(v: unknown): v is Strategy {
  return v === "Charm" || v === "Janus" || v === "None";
}

function isAccount(v: unknown): v is Account {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.binanceName === "string" &&
    typeof o.redisName === "string" &&
    (typeof o.dbName === "string" ||
      o.dbName === null ||
      o.dbName === undefined) &&
    isStrategy(o.strategy) &&
    typeof o.leverage === "number" &&
    Number.isFinite(o.leverage) &&
    typeof o.monitored === "boolean" &&
    typeof o.createdAt === "string" &&
    typeof o.updatedAt === "string"
  );
}

function normalizeNewAccount(v: unknown): NewAccount {
  if (!v || typeof v !== "object") throw new Error("Body must be an object");
  const o = v as Record<string, unknown>;

  const binanceName = o.binanceName;
  const redisName = o.redisName;
  const dbName = o.dbName;
  const strategy = o.strategy;
  const leverage = o.leverage;
  const monitored = o.monitored;

  if (typeof binanceName !== "string" || !binanceName.trim()) {
    throw new Error("binanceName is required");
  }
  if (typeof redisName !== "string" || !redisName.trim()) {
    throw new Error("redisName is required");
  }
  if (!isStrategy(strategy)) {
    throw new Error("strategy must be one of Charm | Janus | None");
  }
  if (typeof leverage !== "number" || !Number.isFinite(leverage)) {
    throw new Error("leverage must be a finite number");
  }
  if (typeof monitored !== "boolean") {
    throw new Error("monitored must be boolean");
  }
  if (
    !(dbName === undefined || dbName === null || typeof dbName === "string")
  ) {
    throw new Error("dbName must be string | null | undefined");
  }

  return {
    binanceName,
    redisName,
    dbName: (dbName as string | null | undefined) ?? null,
    strategy,
    leverage,
    monitored,
  };
}

function normalizePatch(v: unknown): AccountPatch {
  if (!v || typeof v !== "object") throw new Error("Body must be an object");
  const o = v as Record<string, unknown>;

  if ("redisName" in o) throw new Error("redisName is immutable");
  if ("createdAt" in o || "updatedAt" in o) {
    throw new Error("createdAt/updatedAt are server-managed");
  }

  const patch: AccountPatch = {};

  if ("binanceName" in o) {
    if (typeof o.binanceName !== "string" || !o.binanceName.trim()) {
      throw new Error("binanceName must be a non-empty string");
    }
    patch.binanceName = o.binanceName;
  }

  if ("dbName" in o) {
    const db = o.dbName;
    if (!(db === null || db === undefined || typeof db === "string")) {
      throw new Error("dbName must be string | null");
    }
    patch.dbName = (db as string | null | undefined) ?? null;
  }

  if ("strategy" in o) {
    if (!isStrategy(o.strategy)) throw new Error("invalid strategy");
    patch.strategy = o.strategy;
  }

  if ("leverage" in o) {
    if (typeof o.leverage !== "number" || !Number.isFinite(o.leverage)) {
      throw new Error("leverage must be a finite number");
    }
    patch.leverage = o.leverage;
  }

  if ("monitored" in o) {
    if (typeof o.monitored !== "boolean") {
      throw new Error("monitored must be boolean");
    }
    patch.monitored = o.monitored;
  }

  return patch;
}

// ---- public API (server-side)
export async function readAccounts(): Promise<Account[]> {
  const raw = await readRaw();
  if (!Array.isArray(raw)) throw new Error("account.json must be an array");
  const items = raw.filter(isAccount);
  if (items.length !== (raw as unknown[]).length) {
    throw new Error("account.json contains invalid items");
  }
  return items;
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const all = await readAccounts();
  return all.find((a) => a.redisName === id);
}

export async function createAccount(input: unknown): Promise<Account> {
  const body = normalizeNewAccount(input);
  return withLock(async () => {
    const all = await readAccounts();
    if (all.some((a) => a.redisName === body.redisName)) {
      throw new Error(`Account '${body.redisName}' already exists`);
    }
    const now = new Date().toISOString();
    const acc: Account = { ...body, createdAt: now, updatedAt: now };
    const next = [acc, ...all];
    await writeRaw(next);
    return acc;
  });
}

export async function updateAccount(
  id: string,
  patchInput: unknown
): Promise<Account> {
  const patch = normalizePatch(patchInput);
  return withLock(async () => {
    const all = await readAccounts();
    const idx = all.findIndex((a) => a.redisName === id);
    if (idx < 0) throw new Error(`Account '${id}' not found`);
    const current = all[idx];
    const updated: Account = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const next = all.slice();
    next[idx] = updated;
    await writeRaw(next);
    return updated;
  });
}

export async function deleteAccounts(ids: string[]): Promise<number> {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    throw new Error("ids must be string[]");
  }
  return withLock(async () => {
    const all = await readAccounts();
    const set = new Set(ids);
    const next = all.filter((a) => !set.has(a.redisName));
    const removed = all.length - next.length;
    if (removed > 0) await writeRaw(next);
    return removed;
  });
}

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
import raw from "@/data/accounts.json";

/* -------- types that come from the JSON structure -------- */
export type AccountKey = string; // = redisName

export type Strategy = "Janus" | "Charm" | "None" | string;

export interface AccountInfo {
  binanceName: string;
  redisName: AccountKey;
  dbName: string;
  strategy: Strategy;
  leverage: number;
  monitored: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------- normalised, immutable collection ---------- */
const ARR: readonly AccountInfo[] = (raw as AccountInfo[]).map((a) => ({
  ...a,
  leverage: Number(a.leverage) || 0,
}));

/* -------- public helpers used everywhere in the app ------ */
export const ACCOUNTS_INFO = ARR;
export const ACCOUNTS = ARR.map((a) => a.redisName) as readonly AccountKey[];
export const ACCOUNT_SET = new Set(ACCOUNTS);
/* ———  subset that are explicitly monitored ———————————————— */
export const MONITORED_INFO = ARR.filter((a) => a.monitored);
export const MONITORED_ACCOUNTS = MONITORED_INFO.map(
  (a) => a.redisName
) as readonly AccountKey[];
export const MONITORED_LABELS_JOINED = MONITORED_INFO.map((a) =>
  (a.binanceName || a.redisName).toUpperCase()
).join(", ");

export function isMonitored(key: AccountKey): boolean {
  return getAccountInfo(key)?.monitored ?? false;
}

export const CHARM_ACCOUNTS = new Set(
  ARR.filter((a) => a.strategy === "Charm").map((a) => a.redisName)
);
export const JANUS_ACCOUNTS = new Set(
  ARR.filter((a) => a.strategy === "Janus").map((a) => a.redisName)
);

export function getAccountInfo(key: AccountKey): AccountInfo | undefined {
  return ARR.find((a) => a.redisName === key);
}
export const isCharm = (k: AccountKey): boolean => CHARM_ACCOUNTS.has(k);
export const isJanus = (k: AccountKey): boolean => JANUS_ACCOUNTS.has(k);

export function leverageFor(key: AccountKey): number {
  return getAccountInfo(key)?.leverage ?? 0;
}
export function displayNameFor(key: AccountKey): string {
  return (getAccountInfo(key)?.binanceName || key).toUpperCase();
}

/** Names for creds in secret stores: ALWAYS use redisName */
export const keyNameFor = (k: AccountKey) => `${k}_key`;
export const secretNameFor = (k: AccountKey) => `${k}_secret`;

/** Convenience (UI) */
export const ACCOUNT_LABELS_JOINED = ARR.map((a) =>
  (a.binanceName || a.redisName).toUpperCase()
).join(", ");

import type { Pool, RowDataPacket } from "mysql2/promise";

export interface TradeRow {
  symbol: string | null;
  id: string | number | null;
  orderId: string; // bigNumberStrings=true -> string
  realizedPnl: string | number | null;
  commission: string | number | null;
  time: string; // "YYYY-MM-DD HH:mm:ss" (naive DATETIME; dateStrings=true)
}

const SELECT_SQL = `
  SELECT symbol, id, orderId, realizedPnl, commission, time
  FROM ?? 
  WHERE time >= ? AND time <= ?
`;

/**
 * Try a sequence of candidate table names (redisName, then binanceName, then dbName).
 * Returns rows from the first table that exists; empty array if none exist.
 * The time window is inclusive of both endpoints.
 */
export async function selectFromFirstExistingTable(
  pool: Pool,
  tableCandidates: readonly string[],
  startIso: string, // "YYYY-MM-DD 00:00:00"
  endIso: string // "YYYY-MM-DD 23:59:59"
): Promise<TradeRow[]> {
  for (const table of tableCandidates) {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(SELECT_SQL, [
        table,
        startIso,
        endIso,
      ]);
      return rows as unknown as TradeRow[];
    } catch (err: unknown) {
      const msg = String((err as Error)?.message || "");
      // swallow missing-table errors and try next candidate
      if (msg.includes("ER_NO_SUCH_TABLE") || msg.includes("doesn't exist")) {
        continue;
      }
      // any other SQL error: surface it
      throw err;
    }
  }
  return [];
}

/**
 * Find earliest DATE(time) for a given table up to an end date.
 * Returns ISO date (YYYY-MM-DD) or null if table missing/empty.
 */
export async function findEarliestDateForTable(
  pool: Pool,
  table: string,
  endIso: string
): Promise<string | null> {
  const sql = "SELECT DATE(MIN(time)) AS d FROM ?? WHERE time <= ?";
  try {
    const [rows] = await pool.query<RowDataPacket[]>(sql, [
      table,
      `${endIso} 23:59:59`,
    ]);
    const d = (rows?.[0] as RowDataPacket | undefined)?.d as
      | string
      | null
      | undefined;
    return d ?? null;
  } catch (err: unknown) {
    const msg = String((err as Error)?.message || "");
    if (msg.includes("ER_NO_SUCH_TABLE") || msg.includes("doesn't exist")) {
      return null;
    }
    throw err;
  }
}

// lib/db/sql.ts
import { createPool, type Pool } from "mysql2/promise";

/**
 * Singleton MySQL pool for the `trades` database.
 * NOTE: This module must only be imported from server code (API routes, server components).
 */
let pool: Pool | null = null;

export function getSQLTradesPool(): Pool {
    if (!pool) {
        pool = createPool({
            host: process.env.MYSQL_HOST ?? "192.168.50.238",
            port: Number(process.env.MYSQL_PORT ?? 3306),
            user: process.env.MYSQL_USER ?? "247team",
            password: process.env.MYSQL_PASSWORD ?? "password",
            database: process.env.MYSQL_DATABASE ?? "trades",

            waitForConnections: true,
            connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? 10),
            queueLimit: 0,

            // we store timestamps in UTC and convert in SQL via CONVERT_TZ
            timezone: "Z",

            // safer number handling
            supportBigNumbers: true,
            bigNumberStrings: true,

            // keep DATETIME as strings; you already handle parsing/formatting yourself
            dateStrings: true,
        });
    }
    return pool;
}

/** Optional: call this during graceful shutdown (e.g., in custom server) */
export async function endSQLTradesPool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

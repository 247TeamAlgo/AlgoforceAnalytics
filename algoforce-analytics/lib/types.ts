import { DailyReturnDollars, DrawdownBlock, DrawdownPeriod, ISODate, RolledRow, Streaks } from "@/app/(analytics)/analytics/lib/types";

export type AccountKey = import("./accounts").AccountKey;

export type MetricsPayload = {
    config: {
        initial_balance: number;
        run_date: ISODate;
        last_n_days: number;
    };
    daily_return_last_n_days: {
        window_start: ISODate;
        window_end: ISODate;
        daily_rows: RolledRow[];
        total_return_pct_over_window: number | null;
    };
    month_to_date: {
        mtd_return_pct: number | null;
        mtd_return_usd: number;
        mtd_total_fees_usd: number;
        mtd_drawdown_pct: number | null;
    };
    win_rates: {
        rolling_30d_win_rate_pct: number | null;
        win_rate_from_run_start_pct: number | null;
    };
    drawdowns: DrawdownBlock;
    drawdown_period: DrawdownPeriod;

    counts: { number_of_trades_total: number };
    streaks: Streaks;

    // duplicates / convenience
    daily_return_dollars: DailyReturnDollars[];
    mtd_return_dollars: number;
    mtd_total_fees_dollars: number;
    initial_balance: number;
};
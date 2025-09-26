export type { ReportOverlay } from "./types";

const num = (s?: string | null) =>
    s ? Number(String(s).replace(/[^\d.-]/g, "")) || 0 : 0;

export function parseReportText(txt: string) {
    const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const get = (label: string) =>
        lines.find((l) => l.toLowerCase().startsWith(label.toLowerCase()))
            ?.split(":")
            .slice(1)
            .join(":")
            .trim() ?? "";

    return {
        date_str: get("Date") || get("        Date"),
        overall_trades: num(get("Overall Trade(s)")),
        pct_return: num(get("% Return") || get("Unleveraged Return")),
        profit: num(get("Profit")),
        overall_winrate_pct: num(get("Overall Winrate") || get("Winrate")),
        wallet_balance: num(get("Wallet Balance") || get("Current Balance")),
        earning_balance: num(get("Earning Balance")),
        spot_balance: num(get("Spot Balance")),
        current_unrealized_pnl: num(get("Current Unrealized PNL")),
        initial_balance: num(get("Initial Balance")),
    };
}

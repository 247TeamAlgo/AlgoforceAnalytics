// app/api/accounts/route.ts
import { NextResponse } from "next/server";
import { ACCOUNTS_INFO } from "@/app/api/v1/1-performance_metrics/calculators/accounts_json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    if (!Array.isArray(ACCOUNTS_INFO)) {
      return NextResponse.json({ error: "Accounts not configured" }, { status: 500 });
    }
    return NextResponse.json(ACCOUNTS_INFO, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to load accounts" },
      { status: 500 }
    );
  }
}

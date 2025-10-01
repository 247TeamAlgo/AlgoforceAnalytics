import { NextResponse } from "next/server";

// TEST for PNL per symbol
export async function GET(req: Request): Promise<Response> {
  try {
    const body = null;
    const res = NextResponse.json(body, { status: 200 });
    res.headers.set("Cache-Control", "no-store, must-revalidate");
    return res;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/v1/upnl] error:", err);
    return NextResponse.json({ error: "UPNL fetch failed" }, { status: 500 });
  }
}
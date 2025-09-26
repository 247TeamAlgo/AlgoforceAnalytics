import { NextResponse } from "next/server";
import {
  readAccounts,
  type Account,
} from "@/lib/jsonStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(): Promise<NextResponse> {
  try {
    const data = await readAccounts();
    return noStore(NextResponse.json<Account[]>(data, { status: 200 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read";
    return noStore(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
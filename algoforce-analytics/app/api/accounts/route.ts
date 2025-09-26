import { NextResponse } from "next/server";
import {
  readAccounts,
  createAccount,
  deleteAccounts,
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

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const saved = await createAccount(body);
    return noStore(NextResponse.json<Account>(saved, { status: 201 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Create failed";
    const code = msg.includes("already exists") ? 409 : 400;
    return noStore(NextResponse.json({ error: msg }, { status: code }));
  }
}

// Bulk delete: body = { ids: string[] }
export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { ids: string[] };
    const removed = await deleteAccounts(body?.ids);
    return noStore(
      NextResponse.json<{ removed: number }>({ removed }, { status: 200 })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    return noStore(NextResponse.json({ error: msg }, { status: 400 }));
  }
}

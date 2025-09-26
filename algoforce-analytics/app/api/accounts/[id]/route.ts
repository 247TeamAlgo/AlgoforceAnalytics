import { NextResponse } from "next/server";
import {
  getAccount,
  updateAccount,
  deleteAccounts,
  type Account,
} from "@/lib/jsonStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// 👇 params is async now
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const acc = await getAccount(decodeURIComponent(id));
  if (!acc) {
    return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  }
  return noStore(NextResponse.json<Account>(acc, { status: 200 }));
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const updated = await updateAccount(decodeURIComponent(id), body);
    return noStore(NextResponse.json<Account>(updated, { status: 200 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    const code = msg.includes("not found") ? 404 : 400;
    return noStore(NextResponse.json({ error: msg }, { status: code }));
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const removed = await deleteAccounts([decodeURIComponent(id)]);
    if (removed === 0) {
      return noStore(
        NextResponse.json({ error: "Not found" }, { status: 404 })
      );
    }
    return noStore(
      NextResponse.json<{ removed: number }>({ removed }, { status: 200 })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    return noStore(NextResponse.json({ error: msg }, { status: 400 }));
  }
}

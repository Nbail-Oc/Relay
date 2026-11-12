import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { approveSandboxOrder } from "@/lib/assistant";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    return NextResponse.json(await approveSandboxOrder({ userId: auth.user.id, actionId: (await params).id, orderId: body.orderId }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify PayPal approval." }, { status: Number((error as { status?: number })?.status) || 502 }); }
}

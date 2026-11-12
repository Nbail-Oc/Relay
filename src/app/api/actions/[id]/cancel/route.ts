import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { cancelPayPalAction } from "@/lib/assistant";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await cancelPayPalAction({ userId: auth.user.id, actionId: (await params).id })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not cancel PayPal action." }, { status: Number((error as { status?: number })?.status) || 409 }); }
}

import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { reconcilePayPalAction } from "@/lib/assistant";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json(await reconcilePayPalAction({ userId: auth.user.id, actionId: id }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reconcile PayPal action." }, { status: Number((error as { status?: number })?.status) || 502 });
  }
}

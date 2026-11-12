import { NextResponse } from "next/server";
import { getApiAuth } from "@/lib/api-auth";
import { confirmPayPalAction } from "@/lib/assistant";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    return NextResponse.json(await confirmPayPalAction({ userId: auth.user.id, actionId: id, token: body.confirmationToken }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PayPal action failed." }, { status: Number((error as { status?: number })?.status) || 502 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => {
      items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request });
      items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (request.nextUrl.pathname.startsWith("/chat") && !user) { const target = new URL("/auth", request.url); target.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(target); }
  if (request.nextUrl.pathname === "/auth" && user) return NextResponse.redirect(new URL("/chat/new", request.url));
  return response;
}
export const config = { matcher: ["/chat/:path*", "/auth"] };

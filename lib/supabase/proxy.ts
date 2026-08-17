import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

const publicPaths = [
  "/login",
  "/landing",
  "/auth",
  "/u",
  "/discover",
  "/downloads",
  "/device-banned",
  "/privacy",
  "/terms",
  "/refund-policy",
  "/host-policy",
  "/safety",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));
  const deviceId = request.cookies.get("p2c_device_id")?.value;

  if (deviceId && pathname !== "/device-banned") {
    const { data: isDeviceBanned } = await supabase.rpc("is_device_banned", { p_device_id: deviceId });
    if (isDeviceBanned) {
      const url = request.nextUrl.clone();
      url.pathname = "/device-banned";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (!data?.claims && !isPublic && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (data?.claims && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/discover";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

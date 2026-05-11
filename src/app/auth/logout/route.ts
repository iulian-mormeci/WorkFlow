import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSiteUrl } from "@/lib/supabase/site-url";

/**
 * Builds a safe absolute URL for `/` on the canonical public origin.
 * Never throws — bad env or proxy headers must not surface as 500.
 */
function redirectToLandingRoot(req: NextRequest): URL {
  try {
    const u = new URL("/", getSiteUrl());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return u;
  } catch {
    try {
      return new URL("/", req.nextUrl.origin);
    } catch {
      return new URL("http://localhost:3000/");
    }
  }
}

async function handleLogout(req: NextRequest): Promise<NextResponse> {
  const target = redirectToLandingRoot(req);
  const res = NextResponse.redirect(target, { status: 303 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supaUrl || !anonKey) {
    return res;
  }

  try {
    const supabase = createServerClient(supaUrl, anonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            try {
              res.cookies.set(name, value, options ?? { path: "/" });
            } catch {
              /* ignore malformed cookie options */
            }
          }
        }
      }
    });
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn("[auth/logout] signOut:", error.message);
    }
  } catch (e) {
    console.warn("[auth/logout] signOut failed:", e instanceof Error ? e.message : String(e));
  }

  return res;
}

/** Clears Supabase session cookies then 303-redirects to `/` on the canonical origin. */
export async function GET(req: NextRequest) {
  return handleLogout(req);
}

/** Same as GET — some clients or proxies prefer POST for sign-out. */
export async function POST(req: NextRequest) {
  return handleLogout(req);
}

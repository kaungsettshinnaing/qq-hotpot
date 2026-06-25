import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Edge middleware: gate everything behind a valid session cookie. Fine-grained
// role checks happen server-side in each module layout (see requireAnyRole).
// NOTE: keep this self-contained (no bcrypt / Node imports) for the edge runtime.

const SESSION_COOKIE = "qq_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-only-secret-change-me",
);

const PUBLIC_PATHS = new Set<string>(["/login", "/manifest.webmanifest", "/favicon.ico"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/socket.io") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/assets")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      /* fall through to redirect */
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/config";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const backendUrl = getBackendUrl();
  const isVercel = Boolean(process.env.VERCEL);
  const isLocalBackend = backendUrl.includes("127.0.0.1") || backendUrl.includes("localhost");

  // If not on Vercel or if a remote backend is configured, attempt backend fetch
  if (!isVercel || !isLocalBackend) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const backendRes = await fetch(`${backendUrl}/api/auth/me`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          cookie: req.headers.get("cookie") || "",
          authorization: req.headers.get("authorization") || "",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (backendRes.ok) {
        const rawText = await backendRes.text();
        if (rawText && rawText.trim()) {
          try {
            return NextResponse.json(JSON.parse(rawText), { status: backendRes.status });
          } catch {}
        }
      }
    } catch {
      // Backend request failed or timed out, fall through to cookie verification
    }
  }

  // Fallback: Verify the JWT session cookie directly within Next.js
  const session = await getSession();
  if (session) {
    return NextResponse.json({ user: session });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}



import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/config";
import { createToken, COOKIE_NAME } from "@/lib/session";
import { Role } from "@/types";

export const dynamic = "force-dynamic";

const DEMO_USERS: Record<string, { id: string; name: string; role: Role; workspaceName: string }> = {
  "admin@acme.com": {
    id: "usr_admin_demo",
    name: "Sarah Connor (Admin)",
    role: "ADMIN",
    workspaceName: "Acme Corp",
  },
  "analyst@acme.com": {
    id: "usr_analyst_demo",
    name: "Alex Chen (Analyst)",
    role: "ANALYST",
    workspaceName: "Acme Corp",
  },
  "viewer@acme.com": {
    id: "usr_viewer_demo",
    name: "Marcus Brody (Viewer)",
    role: "VIEWER",
    workspaceName: "Acme Corp",
  },
};

async function createFallbackSession(email: string) {
  const normalizedEmail = (email || "").toLowerCase().trim();
  const demoProfile = DEMO_USERS[normalizedEmail] || {
    id: `usr_${Date.now()}`,
    name: normalizedEmail.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ") || "Guest User",
    role: "ADMIN" as Role,
    workspaceName: "Acme Corp",
  };

  const user = {
    id: demoProfile.id,
    name: demoProfile.name,
    email: normalizedEmail || "admin@acme.com",
    role: demoProfile.role,
    workspaceId: "ws_demo_loop",
    workspaceName: demoProfile.workspaceName,
  };

  const token = await createToken({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    workspaceId: user.workspaceId,
    workspaceName: user.workspaceName,
  });

  const response = NextResponse.json({
    success: true,
    message: "Login successful",
    user,
    mode: "cloud-preview",
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const email = body?.email || "";
  const backendUrl = getBackendUrl();
  const isVercel = Boolean(process.env.VERCEL);
  const isLocalBackend = backendUrl.includes("127.0.0.1") || backendUrl.includes("localhost");

  // In Vercel serverless environment with no external backend configured, immediately grant cloud preview session
  if (isVercel && isLocalBackend) {
    return createFallbackSession(email);
  }

  const targetEndpoint = `${backendUrl}/api/auth/login`;
  let backendRes: Response | null = null;
  let lastError: any = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    backendRes = await fetch(targetEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    lastError = err;
  }

  if (!backendRes) {
    console.warn(`[LOGIN] Backend unreachable at ${targetEndpoint} (${lastError?.message}). Falling back to preview session.`);
    return createFallbackSession(email);
  }

  const rawText = await backendRes.text();
  let data: any = {};

  if (rawText && rawText.trim()) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { error: rawText.trim() || `Backend returned status ${backendRes.status}` };
    }
  }

  const response = NextResponse.json(data, { status: backendRes.status });

  const setCookies = backendRes.headers.getSetCookie
    ? backendRes.headers.getSetCookie()
    : [backendRes.headers.get("set-cookie")].filter(Boolean) as string[];

  for (const cookieStr of setCookies) {
    if (cookieStr) {
      response.headers.append("set-cookie", cookieStr);
    }
  }

  return response;
}

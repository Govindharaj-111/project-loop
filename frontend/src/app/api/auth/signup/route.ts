import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/config";
import { createToken, COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

async function createFallbackSignupSession(body: any) {
  const name = body?.name || "New User";
  const email = (body?.email || "user@example.com").toLowerCase().trim();
  const workspaceName = body?.workspaceName || `${name}'s Workspace`;

  const user = {
    id: `usr_${Date.now()}`,
    name,
    email,
    role: "ADMIN" as const,
    workspaceId: `ws_${Date.now()}`,
    workspaceName,
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
    message: "Workspace created successfully",
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

  const backendUrl = getBackendUrl();
  const isVercel = Boolean(process.env.VERCEL);
  const isLocalBackend = backendUrl.includes("127.0.0.1") || backendUrl.includes("localhost");

  if (isVercel && isLocalBackend) {
    return createFallbackSignupSession(body);
  }

  const targetEndpoint = `${backendUrl}/api/auth/signup`;
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
    console.warn(`[SIGNUP] Backend unreachable at ${targetEndpoint} (${lastError?.message}). Granting preview workspace.`);
    return createFallbackSignupSession(body);
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

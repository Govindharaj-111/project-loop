import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL is not configured" },
      { status: 500 }
    );
  }

  try {
    const backendRes = await fetch(`${backendUrl}/api/auth/me`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        cookie: req.headers.get("cookie") || "",
        authorization: req.headers.get("authorization") || "",
      },
      cache: "no-store",
    });

    const rawText = await backendRes.text();
    let data: any = {};

    if (rawText && rawText.trim()) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { error: rawText.trim() || `Backend returned status ${backendRes.status}` };
      }
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Backend API server is unreachable at ${backendUrl}. Cause: ${error?.message || "Connection refused"}` },
      { status: 503 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    const backendRes = await fetch(`${backendUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
    });

    const rawText = await backendRes.text();
    let data: any = {};

    if (rawText && rawText.trim()) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { message: "Logout processed" };
      }
    }

    const response = NextResponse.json(data, { status: 200 });
    response.cookies.delete("loop_session");

    const setCookie = backendRes?.headers?.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }

    return response;
  } catch (error: any) {
    const response = NextResponse.json({ message: "Logout processed" }, { status: 200 });
    response.cookies.delete("loop_session");
    return response;
  }
}

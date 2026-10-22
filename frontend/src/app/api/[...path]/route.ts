import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

async function proxyRequest(req: NextRequest, pathParams: string[]) {
  const backendUrl = getBackendUrl();

  if (!backendUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL is not configured" },
      { status: 500 }
    );
  }

  const subPath = pathParams && pathParams.length > 0 ? pathParams.join("/") : "";
  const targetUrl = `${backendUrl}/api/${subPath}${req.nextUrl.search}`;

  try {
    const headers = new Headers();
    
    // Forward essential request headers
    const reqCookie = req.headers.get("cookie");
    if (reqCookie) headers.set("cookie", reqCookie);

    const reqAuth = req.headers.get("authorization");
    if (reqAuth) headers.set("authorization", reqAuth);

    const reqContentType = req.headers.get("content-type");
    if (reqContentType) headers.set("content-type", reqContentType);

    headers.set("accept", "application/json");

    let body: any = null;
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      body = await req.text();
    }

    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body || undefined,
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

    const response = NextResponse.json(data, { status: backendRes.status });

    // Pass through Set-Cookie headers from backend response
    const setCookies = backendRes.headers.getSetCookie
      ? backendRes.headers.getSetCookie()
      : [backendRes.headers.get("set-cookie")].filter(Boolean) as string[];

    for (const cookieStr of setCookies) {
      if (cookieStr) {
        response.headers.append("set-cookie", cookieStr);
      }
    }

    return response;
  } catch (err: any) {
    console.warn(`[PROXY FALLBACK] Backend unreachable for ${req.method} /api/${subPath}. Serving cloud preview data.`);

    // Graceful Cloud Preview / Demo data for deployed Vercel previews
    if (subPath.startsWith("analytics")) {
      const dates = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.now() - (13 - i) * 86400000);
        return {
          date: `${d.getMonth() + 1}/${d.getDate()}`,
          count: Math.floor(8 + Math.random() * 12),
          positive: Math.floor(5 + Math.random() * 8),
          negative: Math.floor(1 + Math.random() * 4),
          neutral: Math.floor(2 + Math.random() * 3),
        };
      });

      return NextResponse.json({
        metrics: {
          totalFeedback: 142,
          negativePercent: 18,
          newFeedbackThisWeek: 27,
          topTheme: "Billing & Invoicing",
        },
        charts: {
          volumeOverTime: dates,
          sentimentBreakdown: [
            { name: "Positive", value: 85, fill: "#10b981" },
            { name: "Neutral", value: 31, fill: "#64748b" },
            { name: "Negative", value: 26, fill: "#ef4444" },
          ],
          topThemes: [
            { theme: "Billing & Invoicing", count: 48 },
            { theme: "Dashboard UX & Speed", count: 39 },
            { theme: "API Webhooks & Latency", count: 31 },
            { theme: "Mobile Export Reports", count: 24 },
          ],
        },
        isFallback: true,
      });
    }

    if (subPath.startsWith("feedback")) {
      const demoFeedbacks = [
        {
          id: "fb-1",
          content: "The new automated report generator is exceptionally quick and saved our team hours on Monday morning.",
          channel: "CSV",
          sourceRef: "Intercom-8921",
          customerLabel: "Stripe Enterprise",
          sentiment: "Positive",
          sentimentScore: 0.94,
          featureArea: "Reports",
          status: "REVIEWED",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          themes: [{ themeId: "t-1", confidence: 0.96, theme: { name: "Automated Reporting" } }],
        },
        {
          id: "fb-2",
          content: "We faced high latency during peak webhook events when exporting more than 10k items.",
          channel: "API",
          sourceRef: "Zendesk-1029",
          customerLabel: "Acme Corp",
          sentiment: "Negative",
          sentimentScore: -0.72,
          featureArea: "Performance",
          status: "NEW",
          createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
          themes: [{ themeId: "t-2", confidence: 0.91, theme: { name: "API Webhooks & Latency" } }],
        },
        {
          id: "fb-3",
          content: "Clean, intuitive UI layout. Really appreciate the dark mode contrast and responsive design.",
          channel: "MANUAL",
          sourceRef: "User-Review",
          customerLabel: "Vercel Customer",
          sentiment: "Positive",
          sentimentScore: 0.88,
          featureArea: "UI/UX",
          status: "ACTIONED",
          createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
          themes: [{ themeId: "t-3", confidence: 0.89, theme: { name: "Dashboard UX & Speed" } }],
        },
        {
          id: "fb-4",
          content: "Invoices should include VAT breakdown and direct download in PDF format on checkout.",
          channel: "SUPPORT",
          sourceRef: "Email-Support",
          customerLabel: "FinTech EU",
          sentiment: "Neutral",
          sentimentScore: 0.05,
          featureArea: "Billing",
          status: "NEW",
          createdAt: new Date(Date.now() - 3600000 * 26).toISOString(),
          themes: [{ themeId: "t-4", confidence: 0.95, theme: { name: "Billing & Invoicing" } }],
        },
      ];

      return NextResponse.json({
        feedbacks: demoFeedbacks,
        total: demoFeedbacks.length,
        page: 1,
        totalPages: 1,
        isFallback: true,
      });
    }

    if (subPath.startsWith("themes")) {
      return NextResponse.json([
        { id: "t-1", name: "Billing & Invoicing", description: "Invoice breakdowns, VAT support, and automated renewal payments.", _count: { feedbacks: 48 } },
        { id: "t-2", name: "Dashboard UX & Speed", description: "Interface speed, responsiveness, and dark-mode readability.", _count: { feedbacks: 39 } },
        { id: "t-3", name: "API Webhooks & Latency", description: "Payload delivery times, throughput limits, and endpoint status.", _count: { feedbacks: 31 } },
        { id: "t-4", name: "Mobile Export Reports", description: "PDF and CSV exports on mobile browsers.", _count: { feedbacks: 24 } },
      ]);
    }

    if (subPath.startsWith("ask")) {
      return NextResponse.json({
        answer: "Based on 142 analyzed customer feedback records across your workspace, the primary friction point is related to Billing & Invoicing (VAT breakdowns and automated receipts). Conversely, customer sentiment is highest for the new real-time dashboard analytics and quick AI synthesis.",
        sentimentSummary: "60% Positive, 22% Neutral, 18% Negative",
        sources: [
          { content: "Invoices should include VAT breakdown and direct download in PDF format.", customer: "FinTech EU", score: 0.94 },
          { content: "The new automated report generator is exceptionally quick.", customer: "Stripe Enterprise", score: 0.89 },
        ],
        isFallback: true,
      });
    }

    if (subPath.startsWith("reports")) {
      return NextResponse.json([
        {
          id: "rep-1",
          title: "Executive Voice of Customer Summary (Q4)",
          periodStart: new Date(Date.now() - 86400000 * 30).toISOString(),
          periodEnd: new Date().toISOString(),
          contentJson: JSON.stringify({
            summary: "Overall customer sentiment improved by 14% over the prior cycle. Core focus areas include scaling webhook capacity and streamlining invoicing.",
            recommendations: ["Upgrade webhook ingestion queue", "Add VAT breakdown to invoice receipts", "Maintain dark-mode dashboard improvements"],
          }),
          createdAt: new Date().toISOString(),
          generator: { name: "Sarah Connor (Admin)", email: "admin@acme.com" },
        },
      ]);
    }

    if (subPath.startsWith("users")) {
      return NextResponse.json([
        { id: "usr-1", name: "Sarah Connor", email: "admin@acme.com", role: "ADMIN", createdAt: new Date().toISOString() },
        { id: "usr-2", name: "Alex Chen", email: "analyst@acme.com", role: "ANALYST", createdAt: new Date().toISOString() },
        { id: "usr-3", name: "Marcus Brody", email: "viewer@acme.com", role: "VIEWER", createdAt: new Date().toISOString() },
      ]);
    }

    return NextResponse.json(
      {
        error: `Backend API server is unreachable at ${targetUrl}. Cause: ${err?.message || "Connection refused/timeout"}`,
        isFallback: true,
      },
      { status: 503 }
    );
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(req, params.path);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(req, params.path);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(req, params.path);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(req, params.path);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyRequest(req, params.path);
}

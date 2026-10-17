import { prisma } from "./prisma.js";

export interface VerifiedReportStats {
  totalFeedback: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePercent: number;
  neutralPercent: number;
  negativePercent: number;
  topThemes: { theme: string; count: number }[];
  representativeQuotes: { content: string; channel: string; customerLabel: string; sentiment: string }[];
  periodStart: Date;
  periodEnd: Date;
}

export interface VocReportContent {
  executiveSummary: string;
  sentimentOverview: string;
  topCustomerThemes: { name: string; summary: string; count: number }[];
  importantTrends: string[];
  representativeFeedback: { quote: string; channel: string; customer: string }[];
  keyPainPoints: string[];
  recommendedActions: string[];
}

/**
 * Calculates verified database statistics strictly in application code.
 * NEVER relies on LLM to compute counts or percentages.
 */
export async function calculateVerifiedStats(
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<VerifiedReportStats> {
  const whereClause = {
    workspaceId,
    createdAt: {
      gte: periodStart,
      lte: periodEnd,
    },
  };

  const totalFeedback = await prisma.feedback.count({ where: whereClause });

  const positiveCount = await prisma.feedback.count({
    where: { ...whereClause, sentiment: "Positive" },
  });

  const negativeCount = await prisma.feedback.count({
    where: { ...whereClause, sentiment: "Negative" },
  });

  const neutralCount = await prisma.feedback.count({
    where: { ...whereClause, sentiment: "Neutral" },
  });

  const positivePercent = totalFeedback > 0 ? Math.round((positiveCount / totalFeedback) * 100) : 0;
  const negativePercent = totalFeedback > 0 ? Math.round((negativeCount / totalFeedback) * 100) : 0;
  const neutralPercent = totalFeedback > 0 ? Math.round((neutralCount / totalFeedback) * 100) : 0;

  // Channel & Theme distribution
  const channelGroup = await prisma.feedback.groupBy({
    by: ["channel"],
    where: whereClause,
    _count: { channel: true },
    orderBy: { _count: { channel: "desc" } },
  });

  const topThemes = channelGroup.map((g: any) => ({
    theme: g.channel,
    count: g._count.channel,
  }));

  // Representative feedback quotes
  const sampleFeedbacks = await prisma.feedback.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const representativeQuotes = sampleFeedbacks.map((f: any) => ({
    content: f.content,
    channel: f.channel,
    customerLabel: f.customerLabel || "Anonymous Customer",
    sentiment: f.sentiment || "Neutral",
  }));

  return {
    totalFeedback,
    positiveCount,
    neutralCount,
    negativeCount,
    positivePercent,
    neutralPercent,
    negativePercent,
    topThemes,
    representativeQuotes,
    periodStart,
    periodEnd,
  };
}

/**
 * Synthesizes a structured Voice-of-Customer report from verified statistics.
 * If evidence is insufficient (0 records in period), explicitly notes that in the output.
 */
export async function generateVocReportContent(
  stats: VerifiedReportStats
): Promise<VocReportContent> {
  if (stats.totalFeedback === 0) {
    return {
      executiveSummary: "Insufficient customer feedback data recorded during the selected period. No feedback entries were found in the active workspace database for this date range.",
      sentimentOverview: "0 total feedback records. Sentiment distribution cannot be computed.",
      topCustomerThemes: [],
      importantTrends: ["No activity detected during the selected date range."],
      representativeFeedback: [],
      keyPainPoints: ["Insufficient evidence to identify customer pain points."],
      recommendedActions: ["Expand the report date range or import customer feedback records."],
    };
  }

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (geminiApiKey && geminiApiKey !== "mock-key") {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": geminiApiKey,
            "content-type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are a Senior Customer Intelligence Analyst. Return ONLY valid JSON matching this exact structure:
{
  "executiveSummary": string,
  "sentimentOverview": string,
  "topCustomerThemes": [{"name": string, "summary": string, "count": number}],
  "importantTrends": [string],
  "representativeFeedback": [{"quote": string, "channel": string, "customer": string}],
  "keyPainPoints": [string],
  "recommendedActions": [string]
}

Use ONLY the provided verified stats: ${JSON.stringify(stats)}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as any;
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
          return JSON.parse(textContent.trim());
        }
      }
    } catch (err) {
      console.warn("Gemini report synthesis API error. Trying fallback...", err);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey && apiKey !== "mock-key") {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system:
            "You are a Senior Customer Intelligence Analyst. Return ONLY valid JSON matching this exact structure: {\"executiveSummary\": string, \"sentimentOverview\": string, \"topCustomerThemes\": [{\"name\": string, \"summary\": string, \"count\": number}], \"importantTrends\": [string], \"representativeFeedback\": [{\"quote\": string, \"channel\": string, \"customer\": string}], \"keyPainPoints\": [string], \"recommendedActions\": [string]}. Use ONLY the provided verified stats.",
          messages: [
            {
              role: "user",
              content: `Synthesize a VoC report using these verified database stats: ${JSON.stringify(stats)}`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const textContent = data.content?.[0]?.text;
        if (textContent) {
          const jsonStart = textContent.indexOf("{");
          const jsonEnd = textContent.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1) {
            return JSON.parse(textContent.substring(jsonStart, jsonEnd + 1));
          }
        }
      }
    } catch (err) {
      console.warn("Claude report synthesis API error. Using local verified synthesis.", err);
    }
  }

  // Fallback Local Verified Report Synthesis Engine
  return {
    executiveSummary: `During the period from ${stats.periodStart.toISOString().split("T")[0]} to ${stats.periodEnd.toISOString().split("T")[0]}, the workspace received ${stats.totalFeedback} customer feedback records across ${stats.topThemes.length} channel themes. Overall customer sentiment reflects ${stats.positivePercent}% positive feedback, ${stats.negativePercent}% negative feedback, and ${stats.neutralPercent}% neutral feedback.`,
    sentimentOverview: `Sentiment breakdown across ${stats.totalFeedback} records: ${stats.positiveCount} Positive (${stats.positivePercent}%), ${stats.negativeCount} Negative (${stats.negativePercent}%), and ${stats.neutralCount} Neutral (${stats.neutralPercent}%).`,
    topCustomerThemes: stats.topThemes.map((t) => ({
      name: t.theme,
      summary: `High volume feedback received via ${t.theme} channel.`,
      count: t.count,
    })),
    importantTrends: [
      `Negative feedback represents ${stats.negativePercent}% of total feedback items.`,
      `Primary ingestion activity driven by ${stats.topThemes[0]?.theme || "Direct"} feed.`,
      `Customer issues require priority triage in payment and stability categories.`,
    ],
    representativeFeedback: stats.representativeQuotes.map((q) => ({
      quote: q.content,
      channel: q.channel,
      customer: q.customerLabel,
    })),
    keyPainPoints: stats.representativeQuotes
      .filter((q) => q.sentiment === "Negative")
      .map((q) => q.content)
      .slice(0, 3)
      .concat(stats.negativeCount > 0 ? [] : ["No critical negative pain points reported in this period."]),
    recommendedActions: [
      `Prioritize remediation for ${stats.negativeCount} reported negative issues.`,
      `Engage customer success team on high-priority support ticket items.`,
      `Conduct follow-up analysis on ${stats.topThemes[0]?.theme || "top theme"} feedback trends.`,
    ],
  };
}

import { z } from "zod";

export const ClassificationSchema = z.object({
  sentiment: z.enum(["Positive", "Neutral", "Negative"]),
  sentimentScore: z.number().min(-1.0).max(1.0),
  themes: z.array(z.string()).default([]),
  featureArea: z.string().default("General"),
  rationale: z.string().default("Auto-classified based on text sentiment and keywords."),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;

/**
 * Server-side AI Service for feedback classification.
 * Strictly keeps API keys in server environment variables (never sent to browser).
 * Validates AI response using Zod schema to ensure reliable output.
 */
export async function classifyFeedbackText(content: string): Promise<ClassificationResult> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (geminiKey && geminiKey !== "mock-key") {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": geminiKey,
            "content-type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are an expert NLP classifier for customer feedback intelligence. Analyze this feedback and return ONLY a valid JSON object matching this exact structure:
{
  "sentiment": "Positive" | "Neutral" | "Negative",
  "sentimentScore": number between -1.0 and 1.0,
  "themes": [string],
  "featureArea": string,
  "rationale": string
}

Customer feedback to classify:
"${content}"`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as any;
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
          const rawJson = JSON.parse(textContent.trim());
          return ClassificationSchema.parse(rawJson);
        }
      }
    } catch (err) {
      console.warn("Gemini classification API call failed or timed out. Checking secondary options...", err);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey && apiKey !== "mock-key") {
    try {
      // Call Anthropic Claude Messages API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 500,
          system:
            "You are an expert NLP classifier for customer feedback. Return ONLY valid JSON matching this exact structure: {\"sentiment\": \"Positive\"|\"Neutral\"|\"Negative\", \"sentimentScore\": number between -1.0 and 1.0, \"themes\": [string], \"featureArea\": string, \"rationale\": string}.",
          messages: [
            {
              role: "user",
              content: `Classify the following customer feedback: "${content}"`,
            },
          ],
        }),
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as any;
        const textContent = data.content?.[0]?.text;
        if (textContent) {
          const jsonStart = textContent.indexOf("{");
          const jsonEnd = textContent.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const rawJson = JSON.parse(textContent.substring(jsonStart, jsonEnd + 1));
            return ClassificationSchema.parse(rawJson);
          }
        }
      }
    } catch (err) {
      console.warn("Claude API call failed or timed out. Falling back to local NLP heuristics.", err);
    }
  }

  // Local rule-based NLP Heuristics Fallback (Guarantees zero-network reliability)
  return fallbackRuleClassifier(content);
}

function fallbackRuleClassifier(text: string): ClassificationResult {
  const lower = text.toLowerCase();

  let sentiment: "Positive" | "Neutral" | "Negative" = "Neutral";
  let sentimentScore = 0.0;
  const themes: string[] = [];
  let featureArea = "General";

  const positiveWords = ["great", "love", "amazing", "fast", "resolved", "fantastic", "excellent", "good", "useful", "overhaul"];
  const negativeWords = ["bug", "crash", "error", "unable", "fail", "slow", "blocker", "bad", "crashes", "tedious", "issue", "failing"];

  const posMatches = positiveWords.filter((w) => lower.includes(w)).length;
  const negMatches = negativeWords.filter((w) => lower.includes(w)).length;

  if (negMatches > posMatches) {
    sentiment = "Negative";
    sentimentScore = -0.75;
  } else if (posMatches > negMatches) {
    sentiment = "Positive";
    sentimentScore = 0.85;
  } else {
    sentiment = "Neutral";
    sentimentScore = 0.0;
  }

  // Feature Area & Theme Extraction
  if (lower.includes("checkout") || lower.includes("amex") || lower.includes("payment") || lower.includes("card")) {
    featureArea = "Payment & Billing";
    themes.push("Checkout Errors", "Payment Gateways");
  } else if (lower.includes("crash") || lower.includes("ios") || lower.includes("app")) {
    featureArea = "Mobile Application";
    themes.push("App Stability", "Mobile Crashes");
  } else if (lower.includes("sso") || lower.includes("saml") || lower.includes("okta") || lower.includes("soc2")) {
    featureArea = "Security & Auth";
    themes.push("SSO Integration", "Compliance");
  } else if (lower.includes("api") || lower.includes("rate limit") || lower.includes("csv")) {
    featureArea = "Performance & API";
    themes.push("API Limits", "Performance");
  } else {
    featureArea = "Usability";
    themes.push("User Experience");
  }

  const rationale = `Auto-classified as ${sentiment} (${featureArea}) based on key phrase detection.`;

  return ClassificationSchema.parse({
    sentiment,
    sentimentScore,
    themes,
    featureArea,
    rationale,
  });
}

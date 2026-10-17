export type Role = "ADMIN" | "ANALYST" | "VIEWER";
export type Sentiment = "Positive" | "Negative" | "Neutral";
export type FeedbackStatus = "NEW" | "REVIEWED" | "ACTIONED";
export type FeedbackChannel = "MANUAL" | "CSV" | "API" | "SUPPORT" | string;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  workspaceId: string;
  workspaceName?: string;
}

export interface JWTPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
  workspaceId: string;
  workspaceName: string;
  iat?: number;
  exp?: number;
}

export interface FeedbackItem {
  id: string;
  content: string;
  channel: string;
  sourceRef?: string | null;
  customerLabel?: string | null;
  sentiment?: Sentiment | string | null;
  sentimentScore?: number | null;
  featureArea?: string | null;
  rationale?: string | null;
  status: FeedbackStatus | string;
  workspaceId?: string;
  createdAt: string;
  updatedAt?: string;
  themes?: Array<{ themeId: string; confidence: number; theme?: { name: string } }>;
}

export interface ThemeItem {
  id: string;
  name: string;
  description?: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt?: string;
  _count?: { feedbacks: number };
}

export interface ReportItem {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  contentJson: string;
  workspaceId: string;
  generatedBy: string;
  createdAt: string;
  generator?: { name: string; email: string };
}

export interface AnalyticsMetrics {
  totalFeedback: number;
  negativePercent: number;
  newFeedbackThisWeek: number;
  topTheme: string;
}

export interface FeedbackFilter {
  search?: string;
  sentiment?: string;
  status?: string;
  channel?: string;
}

export interface CreateFeedbackInput {
  content: string;
  channel?: string;
  sourceRef?: string;
  customerLabel?: string;
  sentiment?: string;
  sentimentScore?: number;
  status?: string;
}

export interface UpdateFeedbackInput {
  content?: string;
  channel?: string;
  sourceRef?: string;
  customerLabel?: string;
  sentiment?: string;
  sentimentScore?: number;
  status?: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: Role;
}


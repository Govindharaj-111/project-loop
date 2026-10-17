/**
 * Helper utility to resolve the configured Backend API base URL.
 * Defaults to http://127.0.0.1:5000 during local development/start or whenever no external URL is specified.
 */
export function getBackendUrl(): string {
  const rawUrl =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL;

  if (rawUrl && rawUrl.trim()) {
    return rawUrl.trim().replace(/\/+$/, "");
  }

  // Safe fallback to local Express API backend server (port 5000)
  return "http://127.0.0.1:5000";
}

export function isBackendUrlConfigured(): boolean {
  return true;
}


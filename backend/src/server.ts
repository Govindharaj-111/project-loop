import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma.js";
import authRoutes from "./routes/authRoutes.js";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import themeRoutes from "./routes/themeRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import askRoutes from "./routes/askRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import userRoutes from "./routes/userRoutes.js";

// Helper to load .env files into process.env automatically
function loadEnvIfPresent(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Ignore error reading env
  }
}

try {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  loadEnvIfPresent(path.resolve(currentDir, "..", ".env"));
  loadEnvIfPresent(path.resolve(currentDir, "..", "..", ".env"));
  loadEnvIfPresent(path.resolve(process.cwd(), ".env"));
  loadEnvIfPresent(path.resolve(process.cwd(), "backend", ".env"));
} catch {
  // Ignore
}

// Safety: Process-level error handlers to prevent silent crashes
process.on("unhandledRejection", (reason, promise) => {
  console.error("[SERVER ERROR] Unhandled Promise Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[SERVER ERROR] Uncaught Exception thrown:", error);
});

const app = express();

// Enable reverse proxy trust for headers (X-Forwarded-For, X-Forwarded-Proto) behind Render/Vercel proxies
app.set("trust proxy", 1);

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Middleware & Production CORS
const allowedOrigins = Array.from(new Set([
  FRONTEND_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean)));

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        origin.endsWith(".onrender.com") ||
        origin.endsWith(".netlify.app") ||
        origin.endsWith(".pages.dev")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Structured Request Logging Middleware
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== "test") {
    console.log(`[API] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  }
  next();
});

// Health Probe (Liveness & Database Readiness Check)
app.get(["/health", "/api/health"], async (_req, res) => {
  let dbStatus = "connected";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (dbErr: any) {
    dbStatus = "disconnected";
    console.error("[DATABASE ERROR] Database health check failed:", dbErr.message);
  }

  const isOk = dbStatus === "connected";
  res.status(isOk ? 200 : 503).json({
    status: isOk ? "ok" : "degraded",
    database: dbStatus,
    service: "Project LOOP API Backend",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/themes", themeRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ask", askRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/users", userRoutes);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERROR] Unhandled Backend API Server Error:", err);
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: err.message || "An unexpected internal server error occurred",
  });
});

if (process.env.NODE_ENV !== "test") {
  const HOST = process.env.HOST || "0.0.0.0";
  app.listen(Number(PORT), HOST, () => {
    console.log(`=================================================`);
    console.log(`  [SERVER] Project LOOP Backend API running on ${HOST}:${PORT}`);
    console.log(`  [HEALTH] Liveness & DB Check: http://localhost:${PORT}/api/health`);
    console.log(`=================================================`);
  });
}

export default app;

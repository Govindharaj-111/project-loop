import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to parse key-values from .env if not yet populated in process.env
function loadEnvIfPresent(filePath) {
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
    // Ignore error
  }
}

loadEnvIfPresent(path.join(__dirname, "..", ".env"));
loadEnvIfPresent(path.join(__dirname, "..", "..", ".env"));

const dbUrl = process.env.DATABASE_URL || "";
const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");
const isSupabase = dbUrl.includes("supabase.co") || dbUrl.includes("pooler.supabase.com");

console.log("==================================================");
console.log("   PROJECT LOOP — DATABASE CONNECTION CHECK       ");
console.log("==================================================");

if (!dbUrl) {
  console.error("❌ ERROR: DATABASE_URL is not set in backend/.env");
  console.log("Please add your Supabase connection string to backend/.env");
  process.exit(1);
}

const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ":****@");
console.log(`📡 Target URL: ${maskedUrl}`);
console.log(`🔌 Provider Type: ${isPostgres ? (isSupabase ? "Supabase (PostgreSQL)" : "PostgreSQL") : "SQLite"}`);

const prisma = new PrismaClient();

async function checkConnection() {
  const startTime = Date.now();
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    const latency = Date.now() - startTime;
    console.log(`✅ Connection Successful! (Latency: ${latency}ms)`);

    try {
      const workspaceCount = await prisma.workspace.count();
      const feedbackCount = await prisma.feedback.count();
      const userCount = await prisma.user.count();
      console.log(`📊 Current Data:`);
      console.log(`   • Workspaces: ${workspaceCount}`);
      console.log(`   • Users:      ${userCount}`);
      console.log(`   • Feedback:   ${feedbackCount}`);
    } catch {
      console.log("ℹ️  Database tables not created yet. Run `npm run db:setup` to push schema and seed demo data.");
    }

    console.log("==================================================\n");
  } catch (err) {
    console.error("❌ Connection Failed!");
    console.error(`Error details: ${err.message}`);
    if (isSupabase) {
      console.log("\n💡 Supabase Troubleshooting Tips:");
      console.log("1. Check if the database password in the URL is correct.");
      console.log("2. If your password contains special characters like @, #, $, or %, encode them with encodeURIComponent().");
      console.log("3. For transaction pooler connection (port 6543), append `?pgbouncer=true` to DATABASE_URL.");
      console.log("4. In Supabase Dashboard -> Project Settings -> Database, verify 'Direct connection' or 'Connection pooling' string.");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkConnection();

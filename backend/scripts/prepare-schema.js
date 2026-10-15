import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
    // Ignore error reading env
  }
}

// Load backend/.env and workspace root .env if present
loadEnvIfPresent(path.join(__dirname, "..", ".env"));
loadEnvIfPresent(path.join(__dirname, "..", "..", ".env"));

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

let provider = "sqlite";
if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) {
  provider = "postgresql";
} else if (dbUrl.startsWith("file:") || dbUrl.includes(".db") || !dbUrl) {
  provider = "sqlite";
}

try {
  let schemaContent = fs.readFileSync(schemaPath, "utf-8");
  const regex = /datasource\s+db\s*\{[\s\S]*?\}/;

  let newDatasource = `datasource db {\n  provider = "${provider}"\n  url      = env("DATABASE_URL")`;
  if (provider === "postgresql" && directUrl) {
    newDatasource += `\n  directUrl = env("DIRECT_URL")`;
  }
  newDatasource += `\n}`;

  schemaContent = schemaContent.replace(regex, newDatasource);
  fs.writeFileSync(schemaPath, schemaContent, "utf-8");
  console.log(`[PRISMA PREPARE] Dynamic provider set to "${provider}" (from DATABASE_URL)`);
  if (provider === "postgresql" && directUrl) {
    console.log(`[PRISMA PREPARE] Configured directUrl for Supabase migration support`);
  }
} catch (err) {
  console.error("[PRISMA PREPARE ERROR] Failed to adjust schema provider:", err);
}


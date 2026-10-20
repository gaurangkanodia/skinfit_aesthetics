import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

const configPath = resolve(dirname(fileURLToPath(import.meta.url)), "../chatbot-config.json");

export interface RuntimeConfig {
  googleApiKey: string;
  embeddingModel: string;
  generationModel: string;
  pineconeApiKey: string;
  pineconeIndex: string;
  pineconeNamespace: string;
  clinicEmail: string;
  mailFrom: string;
  chatTokenSecret: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  allowedOrigins: Set<string>;
  trustProxy: boolean;
  traceMetadata: boolean;
  langsmithApiKey?: string;
  langsmithProject: string;
  langsmithEndpoint?: string;
  port: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment setting: ${name}`);
  return value;
}

function parsePositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

export function loadPort(): number {
  return parsePositiveInteger("PORT", 3001);
}

export function isChatbotEnabled(): boolean {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    return typeof parsed === "object"
      && parsed !== null
      && "enabled" in parsed
      && parsed.enabled === true;
  } catch {
    return false;
  }
}

export function loadRuntimeConfig(): RuntimeConfig {
  const allowedOrigins = new Set(
    (process.env.CHATBOT_ALLOWED_ORIGINS
      ?? "https://skinfitaesthetics.in,https://www.skinfitaesthetics.in,http://localhost:8765")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => {
        const parsed = new URL(origin);
        if (parsed.origin !== origin) throw new Error("CHATBOT_ALLOWED_ORIGINS must contain only origins.");
        return parsed.origin;
      }),
  );

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
    throw new Error("Set both SMTP_USER and SMTP_PASSWORD, or leave both empty.");
  }
  const traceMetadata = parseBoolean("LANGSMITH_METADATA_TRACING", false);
  const langsmithApiKey = process.env.LANGSMITH_API_KEY?.trim();
  if (traceMetadata && !langsmithApiKey) {
    throw new Error("LANGSMITH_METADATA_TRACING=true requires LANGSMITH_API_KEY.");
  }

  return {
    googleApiKey: required("GOOGLE_API_KEY"),
    embeddingModel: process.env.GOOGLE_EMBEDDING_MODEL?.trim() || "gemini-embedding-001",
    generationModel: process.env.GOOGLE_GENERATION_MODEL?.trim() || "gemini-2.5-flash",
    pineconeApiKey: required("PINECONE_API_KEY"),
    pineconeIndex: required("PINECONE_INDEX"),
    pineconeNamespace: process.env.PINECONE_NAMESPACE?.trim() || "skinfit-clinic",
    clinicEmail: required("CLINIC_EMAIL"),
    mailFrom: required("MAIL_FROM"),
    chatTokenSecret: required("CHATBOT_TOKEN_SECRET"),
    smtpHost: required("SMTP_HOST"),
    smtpPort: parsePositiveInteger("SMTP_PORT", 587),
    smtpSecure: parseBoolean("SMTP_SECURE", false),
    ...(smtpUser ? { smtpUser } : {}),
    ...(smtpPassword ? { smtpPassword } : {}),
    allowedOrigins,
    trustProxy: parseBoolean("TRUST_PROXY", false),
    traceMetadata,
    ...(langsmithApiKey ? { langsmithApiKey } : {}),
    langsmithProject: process.env.LANGSMITH_PROJECT?.trim() || "skinfit-chatbot-metadata",
    ...(process.env.LANGSMITH_ENDPOINT ? { langsmithEndpoint: process.env.LANGSMITH_ENDPOINT } : {}),
    port: loadPort(),
  };
}

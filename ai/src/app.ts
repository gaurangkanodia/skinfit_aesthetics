import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type Express, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { isChatbotEnabled, type RuntimeConfig } from "./config.js";
import { sendAppointmentEmail } from "./mail.js";
import { answerQuestion, summarizeVisitorInquiry, type ChatTurn } from "./rag.js";
import { startMetadataTrace, type MetadataTrace } from "./tracing.js";

const allowedPhone = /^[0-9+(). -]{7,40}$/;
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const previewLifetimeMs = 10 * 60 * 1000;
const issuedPreviews = new Map<string, { serialized: string; expiresAt: number }>();

const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1500),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(1500),
  })).max(10).default([]),
}).strict();

const AppointmentPreviewRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).default(""),
  phone: z.string().trim().max(40).default(""),
  note: z.string().max(500).default(""),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(1500),
  })).max(40).default([]),
}).strict();

const AppointmentSendRequestSchema = z.object({
  token: z.string().min(32).max(512),
  preview: z.object({
    recipient: z.string().email().max(254),
    subject: z.string().min(1).max(180),
    message: z.string().min(1).max(3000),
    attachmentName: z.literal("skinfit-chat-transcript.txt"),
    transcript: z.string().max(20000),
  }).strict(),
}).strict();

class ApiError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "ApiError";
  }
}

function cleanText(value: string, maxLength: number): string {
  const cleaned = value.replace(controlCharacters, "").trim();
  if (Array.from(cleaned).length > maxLength) {
    throw new ApiError("One of the supplied fields is too long.", 400);
  }
  return cleaned;
}

function getAction(request: Request): string | undefined {
  return typeof request.query.action === "string" ? request.query.action : undefined;
}

function sendError(response: Response, error: unknown): void {
  if (error instanceof ApiError) {
    response.status(error.statusCode).json({ ok: false, error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    response.status(400).json({ ok: false, error: "Check the supplied details and try again." });
    return;
  }
  console.error("[chatbot] Request failed; personal content was not logged.");
  response.status(503).json({
    ok: false,
    error: "The assistant is temporarily unavailable. Please try again or contact the clinic directly.",
  });
}

function allowOrigin(config: RuntimeConfig, request: Request, response: Response): boolean {
  const origin = request.get("origin");
  if (!origin || !config.allowedOrigins.has(origin)) {
    response.status(403).json({ ok: false, error: "This website is not allowed to use the chatbot API." });
    return false;
  }
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return true;
}

function signPreview(config: RuntimeConfig, payload: { expiresAt: number; nonce: string; preview: unknown }): string {
  const serialized = JSON.stringify(payload);
  const encoded = Buffer.from(serialized).toString("base64url");
  const signature = createHmac("sha256", config.chatTokenSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyPreviewToken(token: string, config: RuntimeConfig): boolean {
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;
  const encoded = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = createHmac("sha256", config.chatTokenSecret).update(encoded).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return false;
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return false;
  }
  return true;
}

async function handleChat(request: Request, response: Response): Promise<void> {
  const startedAt = Date.now();
  let status: "complete" | "error" = "error";
  let trace: MetadataTrace | undefined;
  try {
    const input = ChatRequestSchema.parse(request.body);
    const message = cleanText(input.message, 1500);
    if (!message) throw new ApiError("Please enter a message before sending.", 400);
    const history: ChatTurn[] = input.history.map((turn) => ({
      role: turn.role,
      content: cleanText(turn.content, 1500),
    })).filter((turn) => turn.content.length > 0);
    trace = startMetadataTrace(
      "skinfit-chat-request",
      "chat",
      startedAt,
      { conversation_turns: history.length },
    );
    const answer = await answerQuestion(message, history, trace);
    status = "complete";
    response.json({ ok: true, answer });
  } catch (error) {
    sendError(response, error);
  } finally {
    if (trace) {
      try {
        await trace.finish(status);
      } catch {
        console.error("[chatbot] LangSmith trace submission failed; chat content was not sent.");
      }
    }
  }
}

async function handleAppointmentPreview(request: Request, response: Response, config: RuntimeConfig): Promise<void> {
  const input = AppointmentPreviewRequestSchema.parse(request.body);
  const name = cleanText(input.name, 100);
  const email = cleanText(input.email, 254);
  const phone = cleanText(input.phone, 40);
  const note = cleanText(input.note, 500);
  if (!name || (!email && !phone)) {
    throw new ApiError("Enter your name and either a phone number or email address.", 400);
  }
  if (email && !z.email().safeParse(email).success) {
    throw new ApiError("Enter a valid email address.", 400);
  }
  if (phone && !allowedPhone.test(phone)) {
    throw new ApiError("Enter a valid phone number.", 400);
  }

  const transcriptLines: string[] = [];
  const visitorStatements: string[] = [];
  let totalCharacters = 0;
  for (const message of input.messages) {
    const content = cleanText(message.content, 1500);
    if (!content) continue;
    totalCharacters += content.length;
    if (totalCharacters > 18000) {
      throw new ApiError("The conversation is too long to attach.", 400);
    }
    transcriptLines.push(`${message.role === "user" ? "Visitor" : "Circuit"}: ${content}`);
    if (message.role === "user") visitorStatements.push(content);
  }
  if (note) visitorStatements.push(`Optional appointment note: ${note}`);

  const traceStartedAt = Date.now();
  const trace = startMetadataTrace(
    "skinfit-appointment-summary",
    "appointment-summary",
    traceStartedAt,
    { visitor_statement_count: visitorStatements.length },
  );
  let traceStatus: "complete" | "error" = "error";
  let summary: string;
  try {
    summary = await summarizeVisitorInquiry(visitorStatements, trace);
    traceStatus = "complete";
  } finally {
    if (trace) {
      try {
        await trace.finish(traceStatus);
      } catch {
        console.error("[chatbot] LangSmith summary trace submission failed; chat content was not sent.");
      }
    }
  }
  const subject = `Skinfit Aesthetics appointment inquiry - ${name.replace(/[\r\n]/g, "")}`;
  const message = [
    "Appointment inquiry",
    `Name: ${name}`,
    `Phone: ${phone || "Not provided"}`,
    `Email: ${email || "Not provided"}`,
    "",
    "AI-generated summary of visitor-stated concerns and treatments of interest (not a diagnosis):",
    summary,
    ...(note ? ["", "Visitor's optional appointment note:", note] : []),
  ].join("\n");
  const transcript = [
    "Skinfit Aesthetics chatbot conversation transcript",
    "Shared by the visitor for this appointment inquiry.",
    ...(note ? ["", `Visitor's optional appointment note: ${note}`] : []),
    "",
    transcriptLines.join("\n\n"),
  ].join("\n");
  const preview = {
    recipient: config.clinicEmail,
    subject,
    message,
    attachmentName: "skinfit-chat-transcript.txt" as const,
    transcript,
  };

  const now = Date.now();
  for (const [token, record] of issuedPreviews) {
    if (record.expiresAt <= now) issuedPreviews.delete(token);
  }
  if (issuedPreviews.size >= 500) {
    throw new ApiError("Appointment inquiries are temporarily busy. Please try again shortly.", 503);
  }
  const expiresAt = now + previewLifetimeMs;
  const nonce = randomBytes(24).toString("base64url");
  const serialized = JSON.stringify({ expiresAt, nonce, preview });
  const token = signPreview(config, { expiresAt, nonce, preview });
  issuedPreviews.set(token, { serialized, expiresAt });

  response.json({ ok: true, preview, token, expiresAt });
}

async function handleAppointmentSend(request: Request, response: Response, config: RuntimeConfig): Promise<void> {
  const input = AppointmentSendRequestSchema.parse(request.body);
  const record = issuedPreviews.get(input.token);
  if (!record || record.expiresAt <= Date.now() || !verifyPreviewToken(input.token, config)) {
    throw new ApiError("The appointment review has expired. Please prepare it again.", 400);
  }
  const tokenPayload = Buffer.from(input.token.slice(0, input.token.lastIndexOf(".")), "base64url").toString("utf8");
  if (tokenPayload !== record.serialized) {
    issuedPreviews.delete(input.token);
    throw new ApiError("The appointment review has changed. Please prepare it again.", 400);
  }

  const preview = input.preview;
  if (preview.recipient.toLowerCase() !== config.clinicEmail.toLowerCase()) {
    issuedPreviews.delete(input.token);
    throw new ApiError("The appointment review has changed. Please prepare it again.", 400);
  }
  issuedPreviews.delete(input.token);
  const replyTo = /^Email: (.+)$/m.exec(preview.message)?.[1];
  await sendAppointmentEmail({
    recipient: preview.recipient,
    subject: preview.subject,
    text: preview.message,
    transcript: preview.transcript,
    ...(replyTo && replyTo !== "Not provided" ? { replyTo } : {}),
  });
  response.json({ ok: true });
}

export function createApp(config: RuntimeConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 24,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.all("/ai/api", (request, response, next) => {
    if (request.method === "GET" && getAction(request) === "status") {
      if (request.get("origin") && !allowOrigin(config, request, response)) return;
      response.setHeader("Cache-Control", "no-store, max-age=0");
      response.json({ enabled: isChatbotEnabled() });
      return;
    }
    if (!isChatbotEnabled()) {
      response.status(404).json({ ok: false, error: "The chatbot is disabled." });
      return;
    }
    if (!allowOrigin(config, request, response)) return;
    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST, OPTIONS");
      response.status(405).json({ ok: false, error: "Method not allowed." });
      return;
    }
    next();
  });
  app.use("/ai/api", express.json({ limit: "30kb", strict: true }));
  app.post("/ai/api", limiter, async (request, response) => {
    try {
      switch (getAction(request)) {
        case "chat":
          await handleChat(request, response);
          return;
        case "appointment-preview":
          await handleAppointmentPreview(request, response, config);
          return;
        case "appointment-send":
          await handleAppointmentSend(request, response, config);
          return;
        default:
          response.status(404).json({ ok: false, error: "Unknown chatbot action." });
      }
    } catch (error) {
      sendError(response, error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof SyntaxError || error?.type === "entity.too.large") {
      response.status(error?.type === "entity.too.large" ? 413 : 400).json({
        ok: false,
        error: error?.type === "entity.too.large" ? "The request is too large." : "The request could not be read.",
      });
      return;
    }
    sendError(response, error);
  };
  app.use(errorHandler);

  return app;
}

export function createDisabledApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.all("/ai/api", (request, response) => {
    if (request.method === "GET" && getAction(request) === "status") {
      response.setHeader("Cache-Control", "no-store, max-age=0");
      response.json({ enabled: false });
      return;
    }
    response.status(404).json({ ok: false, error: "The chatbot is disabled." });
  });
  return app;
}

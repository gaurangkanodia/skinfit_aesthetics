import { createServer } from "node:http";
import { isChatbotEnabled, loadPort, loadRuntimeConfig } from "./config.js";

process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";

const { createApp, createDisabledApp } = await import("./app.js");
const enabled = isChatbotEnabled();
const config = enabled ? loadRuntimeConfig() : undefined;
const server = createServer(config ? createApp(config) : createDisabledApp());

const port = config?.port ?? loadPort();
server.listen(port, "0.0.0.0", () => {
  console.info(`Skinfit chatbot API listening on port ${port}${enabled ? "" : " (disabled)"}.`);
});

function shutdown(signal: string): void {
  console.info(`Received ${signal}; shutting down chatbot API.`);
  server.close((error) => {
    if (error) {
      console.error("Chatbot API shutdown failed.");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

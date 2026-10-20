import { createHash } from "node:crypto";
import { loadRuntimeConfig } from "./config.js";
import { setTimeout } from "node:timers/promises";
import {
  CLINIC_EMBEDDING_DIMENSIONS,
  createIndexEmbeddings,
  documentNamespace,
  loadDocumentsForIndexing,
} from "./rag.js";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";

async function embedBatch(
  embeddings: Awaited<ReturnType<typeof createIndexEmbeddings>>,
  texts: string[],
  firstChunkNumber: number,
): Promise<number[][]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const vectors = await embeddings.embedDocuments(texts);
    if (
      vectors.length === texts.length
      && vectors.every((vector) => vector.length === CLINIC_EMBEDDING_DIMENSIONS)
    ) {
      return vectors;
    }

    const invalidDimensions = vectors.some(
      (vector) => vector.length !== 0 && vector.length !== CLINIC_EMBEDDING_DIMENSIONS,
    );
    if (invalidDimensions || attempt === 2) {
      const invalidVector = vectors.find((vector) => vector.length !== CLINIC_EMBEDDING_DIMENSIONS);
      throw new Error(
        `Google returned incomplete or invalid embeddings for clinic document chunks `
        + `${firstChunkNumber}-${firstChunkNumber + texts.length - 1} `
        + `(expected ${CLINIC_EMBEDDING_DIMENSIONS} dimensions; received ${invalidVector?.length ?? 0}). `
        + "Check Google API quota and embedding model configuration.",
      );
    }

    await setTimeout(attempt === 0 ? 15_000 : 60_000);
  }

  throw new Error("Google embedding retries were exhausted.");
}

async function ingest(): Promise<void> {
  const config = loadRuntimeConfig();
  const { document, chunks } = await loadDocumentsForIndexing();
  const client = new Pinecone({ apiKey: config.pineconeApiKey });
  const embeddings = await createIndexEmbeddings();
  const store = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: client.Index(config.pineconeIndex),
    namespace: documentNamespace(document, config.pineconeNamespace),
    textKey: "text",
    maxConcurrency: 2,
  });
  const ids = chunks.map((chunk, index) => createHash("sha256")
    .update(`clinic.md|${index}|${chunk.pageContent}`)
    .digest("hex"));

  const batchSize = 20;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batchChunks = chunks.slice(offset, offset + batchSize);
    const vectors = await embedBatch(
      embeddings,
      batchChunks.map((chunk) => chunk.pageContent),
      offset + 1,
    );
    await store.addVectors(vectors, batchChunks, { ids: ids.slice(offset, offset + batchSize) });
    console.info(`Indexed ${Math.min(offset + batchChunks.length, chunks.length)} of ${chunks.length} clinic document chunks.`);
    if (offset + batchChunks.length < chunks.length) await setTimeout(13_000);
  }

}

ingest().catch((error: unknown) => {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
  const safeMessage = message
    .replace(/[\r\n]+/g, " ")
    .replace(/((?:api[-_ ]?key|authorization|password|token)\s*[:=]\s*)\S+/gi, "$1[redacted]")
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 600);
  console.error(`Document ingestion failed: ${safeMessage}`);
  process.exitCode = 1;
});

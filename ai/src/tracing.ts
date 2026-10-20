import { Client, RunTree } from "langsmith";
import type { RunTreeConfig } from "langsmith";
import { loadRuntimeConfig } from "./config.js";

type TraceValues = NonNullable<RunTreeConfig["inputs"]>;
type TraceOutputs = NonNullable<RunTreeConfig["outputs"]>;

export interface MetadataTrace {
  step<T>(
    name: string,
    runType: string,
    inputs: TraceValues,
    operation: () => Promise<T>,
    outputs: (result: T) => TraceOutputs,
  ): Promise<T>;
  finish(status: "complete" | "error", outputs?: TraceOutputs): Promise<void>;
}

function flattenRuns(run: RunTree): RunTree[] {
  return [run, ...run.child_runs.flatMap(flattenRuns)];
}

export function startMetadataTrace(
  name: string,
  operation: string,
  startedAt = Date.now(),
  metadata: TraceValues = {},
): MetadataTrace | undefined {
  const config = loadRuntimeConfig();
  if (!config.traceMetadata) return undefined;
  if (!config.langsmithApiKey) {
    throw new Error("LANGSMITH_METADATA_TRACING requires LANGSMITH_API_KEY.");
  }

  const client = new Client({
    apiKey: config.langsmithApiKey,
    ...(config.langsmithEndpoint ? { apiUrl: config.langsmithEndpoint } : {}),
  });
  const root = new RunTree({
    name,
    run_type: "chain",
    project_name: config.langsmithProject,
    inputs: {},
    extra: {
      metadata: {
        operation,
        privacy: "chat-content-excluded",
        ...metadata,
      },
    },
    start_time: startedAt,
    client,
  });

  return {
    async step<T>(
      stepName: string,
      runType: string,
      inputs: TraceValues,
      stepOperation: () => Promise<T>,
      describeOutput: (result: T) => TraceOutputs,
    ): Promise<T> {
      const stepStartedAt = Date.now();
      const child = root.createChild({
        name: stepName,
        run_type: runType,
        inputs,
        start_time: stepStartedAt,
        extra: { metadata: { privacy: "chat-content-excluded" } },
      });
      try {
        const result = await stepOperation();
        await child.end({
          ...describeOutput(result),
          duration_ms: Date.now() - stepStartedAt,
          status: "complete",
        });
        return result;
      } catch (error) {
        await child.end(
          { status: "error", duration_ms: Date.now() - stepStartedAt },
          error instanceof Error ? error.name : "UnknownError",
        );
        throw error;
      }
    },
    async finish(status, outputs = {}) {
      await root.end({
        ...outputs,
        status,
        duration_ms: Date.now() - startedAt,
      }, status === "error" ? "RequestFailed" : undefined);
      await client.batchIngestRuns({
        runCreates: flattenRuns(root).map((run) => run.toJSON()),
      });
    },
  };
}

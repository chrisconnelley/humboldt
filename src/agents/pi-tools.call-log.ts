import { log } from "./pi-embedded-runner/logger.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

const MAX_LOG_CHARS = 100_000;

function extractResultText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      block.type === "text" &&
      typeof block.text === "string"
    ) {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

export function wrapToolWithCallLogging(tool: AnyAgentTool): AnyAgentTool {
  if (!tool.execute) {
    return tool;
  }
  const origExecute = tool.execute;
  return {
    ...tool,
    // oxlint-disable-next-line typescript/no-explicit-any
    execute: async (toolCallId: string, args: any, signal?: AbortSignal, onUpdate?: any) => {
      const startMs = Date.now();
      let argsJson: string;
      try {
        argsJson = trunc(JSON.stringify(args), MAX_LOG_CHARS);
      } catch {
        argsJson = "[unserializable]";
      }
      const argsChars = argsJson.length;
      try {
        const result = await origExecute(toolCallId, args, signal, onUpdate);
        const durationMs = Date.now() - startMs;
        const resultText = trunc(extractResultText(result), MAX_LOG_CHARS);
        const resultChars = resultText.length;
        log.info(
          `tool-call: ${tool.name} args=${argsChars}c result=${resultChars}c ${durationMs}ms`,
          {
            consoleMessage: `tool-call: ${tool.name} args=${argsChars}c result=${resultChars}c ${durationMs}ms`,
            toolCall: {
              toolName: tool.name,
              toolCallId,
              argsJson,
              argsChars,
              resultText,
              resultChars,
              durationMs,
              error: null,
            },
          },
        );
        return result;
      } catch (err) {
        const durationMs = Date.now() - startMs;
        const error = err instanceof Error ? err.message : String(err);
        log.info(`tool-call: ${tool.name} args=${argsChars}c ERROR ${durationMs}ms`, {
          consoleMessage: `tool-call: ${tool.name} args=${argsChars}c ERROR ${durationMs}ms`,
          toolCall: {
            toolName: tool.name,
            toolCallId,
            argsJson,
            argsChars,
            resultText: null,
            resultChars: 0,
            durationMs,
            error,
          },
        });
        throw err;
      }
    },
  };
}

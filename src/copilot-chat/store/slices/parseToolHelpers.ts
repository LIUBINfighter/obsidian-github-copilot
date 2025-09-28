// src/copilot-chat/store/slices/parseToolHelpers.ts

import { MessageData } from "./message.tsx"; // Adjusted import path to match file structure

// Parse both XML and JSON tool calls from messages
export function parseToolCallsFromAssistantMessage(content: string | null): Array<{ id: string, name: string, arguments: Record<string, unknown> }> {

  const toolCalls: Array<{ id: string, name: string, arguments: Record<string, unknown> }> = [];

  // XML parsing priority (new LLM format)
  // Enhanced regex with nested capturing groups and proper escaping
  const xmlToolCallRegex = /<tool_call(?:\s+[^>]*?\s+)?"\s+name=['"]([^'"]+)['"](?:\s+[^>]*?\s+)?\s+arguments=['"](\{(?:[^{}]|(?<o>\{)|(?<-o>\}))+\})['"](?:\s+[^>]*?)?>/gs;
  
  for (const match of [...content.matchAll(xmlToolCallRegex)]) {
    const [, name, argumentsString] = match; // Named groups for stability
    if (!name || !argumentsString)

[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]

  // Fallback: Standard JSON tool_calls field
  try {
    const legacyCalls = (content && content !== 'null') ? JSON.parse(content)?.tool_calls : [];
    legacyCalls.forEach((legacy: any) => {
      if (!legacy.name) return; // Skip invalid legacy parse
      toolCalls.push({
        id: legacy.id || `legacy_call_${Date.now()}_${legacy.name.replace(/[^a-z0-9]/g, '_')}`,
        name: legacy.name,
        arguments: legacy.arguments,
      });
    });
  } catch (e) {
    console.warn("Fallback parsing error (JSON):", e);
  }

  return toolCalls;
}

declare module "./message" {
  export interface MessageData {
    // Add any additional fields used (e.g. rawContent for saving)
    rawContent?: string;
  }
}

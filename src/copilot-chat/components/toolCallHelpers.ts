import { MessageData } from "../../store/slices/message";

// Parse both XML and JSON tool calls from messages
export function parseToolCallsFromMessage(
  content: string | null,
  assistantRole: "assistant" | "tool"
): Array<{ id: string; name: string; arguments: Record<string, unknown> }> {

  const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

  // XML parsing priority (new LLM format)
  if (assistantRole === "assistant") {
    const xmlToolCallPattern = /<tool_call[^>]*name="([^"]*)" arguments='({[\s\S]*?})'>.*?<\/tool_call [BOTU]/g;
    let match: RegExpExecArray | null;
    while ((match = xmlToolCallPattern.exec(content || ""))) {
      try {
        const id = `xml-${match[1]}-${Date.now()}`;
        const name = match[1];
        const argumentsJson = JSON.parse(JSON.stringify(match[2])); // Defensive copy of arguments
        toolCalls.push({ id, name, arguments: argumentsJson });
      } catch (e) {
        console.warn(`Unable to parse tool call with name:${match[1]}`, e);
      }
    }
  }

  // Fallback to legacy JSON format (old tool call structure)
  try {
    // Use standard JSON.parse instead of content parsing
    const legacyCalls = (content && content.includes("\n")) ? JSON.parse(content)?.tool_calls : [];
    for (const call of legacyCalls) {
      toolCalls.push({
        id: call.id || `legacy-${call.name}-${Date.now()}-${Math.floor(Math.random()*10000)}`, // Ensure unique id
        name: call.name,
        arguments: typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments
      });
    }
  } catch (e) {
    // Intentionally silent since XML parser is preferred
  }

  return toolCalls;
}

/**
 * Formats tool execution results into Markdown-compatible strings
 */
export function formatToolResultForUI(result: any, role: "tool" | "assistant", toolName?: string): {
  id: string;
  content: string;
  role: string;
} {
  const id = `${role}-result-${Date.now()}-${Math.floor(Math.random()*1000)}`;

  if (result?.content) {
    // Markdown rendering safe
    return {
      id,
      role: "tool",
      content: `**${role} Tool**: ${toolName || `Result`}\n${result.content}`
    }
  } else {
    // Syntax highlighting for JSON results
    const normalizedResult = typeof result === "object" ? JSON.stringify(result, null, 2) : result;
    const markdownSafeOutput = normalizedResult
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">");

    return {
      id,
      role: "tool",
      content: `**${role} Result**: ${toolName || "Tool"}\n\`\`\`json\n${markdownSafeOutput}\n\`\`\``
    }
  }
}

export function copyToolResultToClipboardHandler(content: string | Record<string, unknown>) {
  const copyText = typeof content === "string" ? content : JSON.stringify(content, null, 2);

  navigator.clipboard.writeText(copyText)
    .then(() => console.log("Tool result copied"))
    .catch((e) => console.error("Failed to copy tool result:", e));
}

export function highlightLinkedCodeBlocks(content: string, theme: string) {
  const linkPattern = /\[\[([^\]]+)\]\]`;
  return content.replace(linkPattern, (_, notePath) => {
    // Simulate Obsidian note content here or show unlinked text
    return `\`\`\`${theme}\n// Content from ${notePath}\n\`\`\``;
  });
}

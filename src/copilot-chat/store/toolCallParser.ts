export function parseXMLToolCalls(content: string): Array<{ id: string; name: string; arguments: any }> {
  const toolCalls: Array<{ id: string; name: string; arguments: any }> = [];

  // Regular expression to match multi-line XML blocks and capture:
  //  1. Tool call name
  //  2. Arguments object
  const toolCallPattern = /<tool_call>\s*name: "([^"]+)"\s*arguments: (\{[\s\S]*?\})\s*<\/tool_call>/gs;
  let match;
  while ((match = toolCallPattern.exec(content)) !== null) {
    const name = match[1].trim();
    let argumentsObj: Record<string, any> = {};

    try {
      argumentsObj = JSON.parse(match[2]);
    } catch (e) {
      console.warn(`Failed to parse JSON in tool call XML for ${name}:`, e);
      argumentsObj = {};
    }

    toolCalls.push({
      id: `tool-${Date.now()}-${name}-${Math.random().toString(36).substring(8)}`,
      name,
      arguments: argumentsObj,
    });
  }

  return toolCalls;
}

export function parseToolCalls(assistantResponse: any): Array<{ id: string; name: string; arguments: any }> {
  if (!assistantResponse?.tool_calls || !Array.isArray(assistantResponse?.tool_calls)) {
    return [];
  }

  // Typescript: Add explicit type for loop parameter
  return assistantResponse.tool_calls.map((toolCall: any) => {
    // Validate schema
    if (typeof toolCall.name !== 'string' || (typeof toolCall.arguments !== 'object' && toolCall.arguments !== null)) {
      console.warn(`Invalid tool call entry ignored: ${JSON.stringify(toolCall, null, 2)}`);
      return null;
    }

    // Generate unique ID per-instance to support parallel executions
    // (in case 2 tools have the same name called in same batch)
    let uniqueId = `tool-${Date.now()}-${toolCall.name}-`;
    const suffix = Math.random().toString(36).substring(2, 8);
    uniqueId += suffix.replace(/[^a-z0-9]/gi, ''); // Sanitize

    return {
      id: uniqueId,
      name: toolCall.name,
      arguments: toolCall.arguments || {}, // Ensure empty object as default
    }
  })
  .filter((entry) => entry !== null) // Remove invalid/null entries
  .map((entry, idx) => {
    // Add sequential execution number for UI clarity
    if (entry?.id) {
      entry.id += `-${idx + 1}`;
    }
    return entry;
  });
}

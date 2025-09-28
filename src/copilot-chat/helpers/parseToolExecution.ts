import { MessageData, PayloadError, ToolCall } from "types";

export function processToolExecution(assistantMsg: MessageData) {
  if (!assistantMsg.role === "assistant") return [];
  
  // Check for existing tool_calls
  let parsedCalls: ToolCall[] = [];
  try {
    parsedCalls = parseToolDefinitions(assistantMsg.content);
  } catch(e) {
    captureException('parseToolDefinitions failed', e);
  }

  return parsedCalls.filter(c => {
    if (!c.name || typeof c.arguments !== "object") {
    // Error handling: invalid tool definitions
      console.error("Illegal tool call format: ", c);
      return false;
    }
    return true;
  });
}

const XML_TOOL_CALL_REGEXP = /<\?xml\s.*?(<tool_call\b[^>]*>)(.*?)<\/tool_call>/gms;

function parseToolDefinitions(rawContent: string): ToolCall[] {

  let tools: ToolCall[] = extractToolNodes(rawContent).map(node => {
    // Add default values if missing parameters 
    const parsedNode = parseNestedXMLNode(node);
    if (!parsedNode.hasOwnProperty("name") && !parsedNode.hasOwnProperty("arguments")) {
      // Assume escaped XML?
      throw new PayloadError("Missing tool definition name/arguments in XML node")
    }
    return {
      name: parsedNode.name.toLowerCase(),
      arguments: parsedNode.arguments ? JSON.parse(parsedNode.arguments) : {},
      role: undefined // Add metadata as needed
    }
  });
  
  return tools;
}

function extractToolNodes(content: string): string[] {
  const matches = [];
  let match;

  while(match = XML_TOOL_CALL_REGEXP.exec(content)) {
    matches.push(match[1]);
  }

  return matches.length ? matches : [content];
}

function parseNestedXMLNode(node: string) {
  const openTag = node.match(/^<[^>]+>$/);
  if (!openTag) throw new Error(`Invalid XML node detected: ${node}`);
  
  const tagName = openTag[0].match(/^<(\w+)[^>]*>$/)[1];
  const closeTag = `</${tagName}>`;

  const innerContent = node
    .substring(openTag[0].length, node.length - closeTag.length)
    .trim(); // Assume arguments are always on next line
  
  const params: Record<string, any> = {};

  for (const attribute of openTag[0].matchAll(/(\w+)="([^"]+)"/g)) {
    params[attribute[1]] = attribute[2]
  }

  // Try to parse inner content as valid JSON first:
  try {
    const args = JSON.parse(innerContent);
    Object.assign(params, args); 
  } catch {
    if(innerContent.startsWith("{")) {
      // Handle malformed JSON (like escaped backslashes)
      try {
        const escapedContent = innerContent
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n')
          .replace(/"/g, '"');
        Object.assign(params, JSON.parse(escapedContent));
      } catch(e) {
        console.warn("Inner content couldn't be parsed as JSON. Keeping raw params.");
      }
    }
  }
 
  return params;
}

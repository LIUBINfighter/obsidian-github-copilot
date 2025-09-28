import SyntaxHighlighter from 'react-syntax-highlighter';
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { MessageProps, ToolCall } from 'types';

export function formatMessageContent(content: string, role: string): JSX.Element {
  if (['tool', 'assistant'].includes(role)) {
    // For tools, syntax highlight their argument structures
    try {
      const preformatted = JSON.stringify(JSON.parse(content), null, 2);
      return <SyntaxHighlighter language="json" style={github}>
        {preformatted}
      </SyntaxHighlighter>
    } catch (e) {
      console.warn("Non-JSON tool output:", content);
    }
  }

  return <>{content}</>; // Return markdown as inline
}

export function combineToolCallResults(calls: ToolCall[]) {
  if (!calls.length) return "";

  let resultText = "Multiple tool calls executed:\n\n";

  // Format each tool's output as code blocks
  calls.forEach(call => {
    resultText += `**Name:**  ${call.name}\n`;
    resultText += `\`\`\`json\n`;

    if (call.error) {
      resultText += `{ "errorMessage": "${call.error}" }\n`;
    } else {
      try {
        resultText += JSON.stringify(call.data, null, 2);
      } catch {
        resultText += `Non-serializable data`;
      }
    }
    resultText += '```\n\n';
  });

  return resultText;
}

import { combineReducers, createSlice } from "@reduxjs/toolkit";
import { ToolResult } from "../../types";

// Tool call execution state tracking
interface McpState {
  executingIds: Set<string>,
  results: Record<string, ToolResult>,
}

const initialState = {
  executingIds: new Set<string>(),
  results: {},
}

export const toolExecutionSlice = createSlice({
  name: 'toolExecution',
  initialState,
  reducers: {
    // Execute tool calls and track their state
    executeToolCalls(state, action) {
      action.payload.forEach(toolCall => {
        // Assign unique ID to each tool call
        if (!toolCall.id) {
          toolCall.id = `tc-${Math.floor(Math.random()*1000)}-${Date.now()}`;
        }
        
        if(isValidToolOperation(toolCall)) {
          state.executingIds.add(toolCall.id);
          // Add UI feedback (toast, loading spinner etc)
        }
      });
    },
    // Called when tool execution completes
    toolExecutionComplete(state, action) {    
      const {toolCallId, result} = action.payload;
      state.executingIds.delete(toolCallId);
      state.results[toolCallId] = result;
    }
  }
});

function isValidToolOperation(call) {
  return call.name // Validate parameters
    && (typeof call.arguments === "object" || typeof call.arguments === "string");
}

export default combineReducers({
  // Other reducers...
  toolExecution: toolExecutionSlice.reducer
});

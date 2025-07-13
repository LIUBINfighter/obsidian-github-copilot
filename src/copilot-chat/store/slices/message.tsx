import { StateCreator } from "zustand";
import { Notice } from "obsidian";
import CopilotPlugin from "../../../main";
import { SendMessageRequest, sendMessage } from "../../api/sendMessage";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

// 工具调用循环的最大次数
const MAX_TOOL_CALL_ITERATIONS = 5;

// 解析工具调用的正则表达式
const TOOL_CALL_REGEX = /<tool_call>\s*name:\s*"([^"]+)"\s*arguments:\s*({[^}]*})\s*<\/tool_call>/gs;

/**
 * 执行工具调用循环
 */
async function performToolCallLoop(
	plugin: CopilotPlugin | undefined,
	validToken: string,
	activeConversationId: string,
	notes: { path: string; filename: string; content: string }[],
	availableTools: Tool[],
	get: any,
	set: any,
): Promise<void> {
	let iterations = 0;
	let currentMessages = buildMessageHistory(plugin, get, activeConversationId, notes, availableTools);

	while (iterations < MAX_TOOL_CALL_ITERATIONS) {
		iterations++;

		// 发送消息到 LLM
		const requestData: SendMessageRequest = {
			intent: false,
			model: get().selectedModel.value,
			temperature: 0,
			top_p: 1,
			n: 1,
			stream: false,
			messages: currentMessages.map(msg => ({
				content: msg.content,
				role: msg.role,
			})),
		};

		const response = await sendMessage(requestData, validToken);

		if (!response?.choices?.[0]?.message?.content) {
			break;
		}

		const assistantContent = response.choices[0].message.content;
		
		// 解析是否包含工具调用
		const toolCalls = parseToolCalls(assistantContent);

		if (toolCalls.length === 0) {
			// 没有工具调用，这是最终回复
			const finalMessage: MessageData = {
				id: response.id || Date.now().toString() + "-assistant",
				content: assistantContent,
				role: "assistant",
				timestamp: Date.now(),
			};

			get().addMessageToConversation(activeConversationId, finalMessage);
			set((state: MessageSlice) => ({
				messages: [...state.messages, finalMessage],
				isLoading: false,
			}));
			break;
		}

		// 执行工具调用
		for (const toolCall of toolCalls) {
			// 添加 assistant 消息（包含工具调用）
			const assistantMessage: MessageData = {
				id: Date.now().toString() + "-assistant-tool-call",
				content: `调用工具: ${toolCall.name}`,
				role: "assistant",
				timestamp: Date.now(),
				toolCall: toolCall,
			};

			get().addMessageToConversation(activeConversationId, assistantMessage);
			set((state: MessageSlice) => ({
				messages: [...state.messages, assistantMessage],
			}));
			currentMessages.push(assistantMessage);

			// 执行工具
			const toolResult = await plugin?.mcpManager.callTool(
				toolCall.name,
				toolCall.arguments,
			);

			// 添加工具结果消息
			const toolResultMessage: MessageData = {
				id: Date.now().toString() + "-tool-result",
				content: toolResult?.success
					? `工具执行成功: ${JSON.stringify(toolResult.result)}`
					: `工具执行失败: ${toolResult?.error}`,
				role: "tool",
				timestamp: Date.now(),
				toolCallId: toolCall.id,
				toolResult: toolResult,
			};

			get().addMessageToConversation(activeConversationId, toolResultMessage);
			set((state: MessageSlice) => ({
				messages: [...state.messages, toolResultMessage],
			}));
			currentMessages.push(toolResultMessage);
		}
	}

	// 保存对话
	if (plugin) {
		get().saveConversations(plugin);
	}

	// 结束加载状态
	set({ isLoading: false });
}

/**
 * 解析消息中的工具调用
 */
function parseToolCalls(content: string): Array<{
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}> {
	const toolCalls: Array<{
		id: string;
		name: string;
		arguments: Record<string, unknown>;
	}> = [];

	let match;
	while ((match = TOOL_CALL_REGEX.exec(content)) !== null) {
		try {
			const name = match[1];
			const argumentsStr = match[2];
			const arguments_ = JSON.parse(argumentsStr);
			
			toolCalls.push({
				id: Date.now().toString() + "-" + Math.random(),
				name,
				arguments: arguments_,
			});
		} catch (error) {
			console.error("Failed to parse tool call:", error);
		}
	}

	return toolCalls;
}

/**
 * 构建消息历史，包含系统提示和工具定义
 */
function buildMessageHistory(
	plugin: CopilotPlugin | undefined,
	get: any,
	activeConversationId: string,
	notes: { path: string; filename: string; content: string }[],
	availableTools: Tool[],
): MessageData[] {
	const activeConversation = get().conversations.find(
		(conv: any) => conv.id === activeConversationId,
	);

	const messageHistory = activeConversation
		? activeConversation.messages
		: get().messages;

	// 获取当前活动配置文件的 systemPrompt
	let systemPrompt = "";
	if (plugin && plugin.profileManager) {
		const activeProfile = plugin.profileManager.getActiveProfile();
		systemPrompt = activeProfile?.systemPrompt || "";
	}

	// 如果有可用工具，在系统提示中添加工具定义
	if (availableTools.length > 0) {
		const toolsDescription = availableTools
			.map(tool => `- ${tool.name}: ${tool.description}`)
			.join('\n');
		
		systemPrompt += `

可用工具列表:
${toolsDescription}

如果需要使用工具，请使用以下格式:
<tool_call>
name: "工具名称"
arguments: {"参数名": "参数值"}
</tool_call>`;
	}

	const messages: MessageData[] = systemPrompt
		? [{ 
			id: "system", 
			content: systemPrompt, 
			role: "system" as const, 
			timestamp: Date.now() 
		}, ...messageHistory]
		: [...messageHistory];

	// 处理链接的笔记
	if (notes.length > 0 && messages.length > 0) {
		const lastUserMessageIndex = messages.findLastIndex(msg => msg.role === "user");
		
		if (lastUserMessageIndex !== -1) {
			const lastUserMessage = messages[lastUserMessageIndex];
			const linkedNotesText = notes
				.map(
					(note) =>
						`\n\nReferenced content from [[${note.filename}]]:\n${note.content}`,
				)
				.join("\n\n");

			messages[lastUserMessageIndex] = {
				...lastUserMessage,
				content: `${lastUserMessage.content}${linkedNotesText}`,
			};
		}
	}

	return messages;
}

export interface MessageData {
	id: string;
	content: string;
	role: "user" | "assistant" | "system" | "tool";
	timestamp: number;
	linkedNotes?: {
		path: string;
		filename: string;
		content: string;
	}[];
	// 工具调用相关字段
	toolCall?: {
		id: string;
		name: string;
		arguments: Record<string, unknown>;
	};
	toolCallId?: string; // 用于关联工具调用结果
	toolResult?: {
		success: boolean;
		result?: unknown;
		error?: string;
	};
}

export interface ModelOption {
	label: string;
	value: string;
}

export interface MessageSlice {
	messages: MessageData[];
	isLoading: boolean;
	error: string | null;
	selectedModel: ModelOption;
	availableModels: ModelOption[];

	initMessageService: (plugin: CopilotPlugin | undefined) => void;
	sendMessage: (
		plugin: CopilotPlugin | undefined,
		apiMessage: string,
		displayMessage?: string,
		linkedNotes?: { path: string; filename: string; content: string }[],
	) => Promise<void>;
	clearMessages: () => void;
	setSelectedModel: (
		plugin: CopilotPlugin | undefined,
		model: ModelOption,
	) => void;
	applyProfileSettings: (plugin: CopilotPlugin) => void;
}

export const defaultModels: ModelOption[] = [
	{ label: "GPT-4o", value: "gpt-4o-2024-08-06" },
	{ label: "GPT-4.1", value: "gpt-4.1-2025-04-14" },
	{ label: "GPT-o1", value: "o1-2024-12-17" },
	{ label: "GPT-o3-mini", value: "o3-mini" },
	{ label: "GPT-o4-mini", value: "o4-mini" },
	{ label: "Claude 3.7 Sonnet Thinking", value: "claude-3.7-sonnet-thought" },
	{ label: "Claude 3.7 Sonnet", value: "claude-3.7-sonnet" },
	{ label: "Claude 3.5 Sonnet", value: "claude-3.5-sonnet" },
	{ label: "Claude Sonnet 4", value: "claude-sonnet-4" },
	{ label: "Gemini 2.0 Flash", value: "gemini-2.0-flash-001" },
	{ label: "Gemini 2.5 Pro", value: "gemini-2.5-pro-preview-05-06" },
];

export const createMessageSlice: StateCreator<
	any, // We use any here as we'll properly type it in the store.ts
	[],
	[],
	MessageSlice
> = (set, get) => ({
	messages: [],
	isLoading: false,
	error: null,
	selectedModel: defaultModels[0],
	availableModels: defaultModels,

	initMessageService: (plugin: CopilotPlugin | undefined) => {
		if (plugin && plugin.profileManager) {
			const activeProfile = plugin.profileManager.getActiveProfile();
			if (activeProfile && activeProfile.selectedModel) {
				set({ selectedModel: activeProfile.selectedModel });
			}
		}
	},
	sendMessage: async (
		plugin: CopilotPlugin | undefined,
		apiMessage: string,
		displayMessage?: string,
		linkedNotes?: { path: string; filename: string; content: string }[],
	) => {
		if (!get().isAuthenticated) {
			new Notice("You need to be authenticated to send messages");
			return;
		}

		const notes = linkedNotes || [];

		const userMessage: MessageData = {
			id: Date.now().toString(),
			content: displayMessage || apiMessage,
			role: "user",
			timestamp: Date.now(),
			linkedNotes: notes.length > 0 ? notes : undefined,
		};

		let activeConversationId = get().activeConversationId;

		if (!activeConversationId) {
			activeConversationId = get().createConversation(
				plugin,
				get().selectedModel,
			);
		}

		get().addMessageToConversation(activeConversationId, userMessage);

		set((state: MessageSlice) => ({
			messages: [...state.messages, userMessage],
			isLoading: true,
			error: null,
		}));

		try {
			const validToken = await get().checkAndRefreshToken(plugin);

			if (!validToken) {
				throw new Error("Failed to get a valid access token");
			}

			// 获取 MCP 工具（如果可用）
			const availableTools = plugin?.mcpManager.getAvailableTools() || [];

			// 开始工具调用循环
			await performToolCallLoop(
				plugin,
				validToken,
				activeConversationId,
				notes,
				availableTools,
				get,
				set,
			);

		} catch (error) {
			console.error("Error sending message:", error);
			set({
				error:
					error instanceof Error
						? error.message
						: "Failed to send message",
				isLoading: false,
			});
			new Notice("Failed to get a response from GitHub Copilot");
		}
	},

	clearMessages: () => {
		set({
			messages: [],
			error: null,
		});

		const plugin = get().plugin;
		if (plugin) {
			get().createConversation(plugin, get().selectedModel);
		}
	},

	setSelectedModel: (
		plugin: CopilotPlugin | undefined,
		model: ModelOption,
	) => {
		set({
			selectedModel: model,
		});

		if (plugin && plugin.profileManager) {
			plugin.profileManager
				.updateActiveProfile({ selectedModel: model })
				.catch((error: any) => {
					console.error("Failed to save selected model:", error);
				});
		}
	},

	// 新增：用于配置文件切换后同步聊天设置
	applyProfileSettings: (plugin: CopilotPlugin) => {
		if (plugin && plugin.profileManager) {
			const activeProfile = plugin.profileManager.getActiveProfile();
			set({
				selectedModel: activeProfile.selectedModel,
			});
		}
	},
});

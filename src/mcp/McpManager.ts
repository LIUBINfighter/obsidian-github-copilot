import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import CopilotPlugin from "../main";
import { IStdioMcpServerConfig, McpServerConfig } from "../helpers/Profile";

// 连接状态
enum ConnectionStatus {
	DISCONNECTED = "disconnected",
	CONNECTING = "connecting",
	CONNECTED = "connected",
	ERROR = "error",
}

// MCP连接信息接口
interface McpConnectionInfo {
	id: string;
	config: McpServerConfig;
	status: ConnectionStatus;
	client: Client;
	transport: StdioClientTransport | null;
	tools: Tool[];
	lastError?: string;
}

// 工具调用结果接口
interface ToolCallResult {
	success: boolean;
	result?: unknown;
	error?: string;
}

/**
 * 管理与 MCP 服务器的连接和通信。
 * 基于官方 MCP TypeScript SDK 实现
 */
export class McpManager {
	private plugin: CopilotPlugin;
	// 用于跟踪活动的MCP连接
	private activeConnections: Map<string, McpConnectionInfo> = new Map();

	constructor(plugin: CopilotPlugin) {
		this.plugin = plugin;
	}

	/**
	 * 初始化 McpManager，并根据当前活动的 Profile 连接到服务器。
	 */
	public async initialize(): Promise<void> {
		await this.connectToActiveProfileServers();
	}

	/**
	 * 当配置文件切换时，更新 MCP 连接。
	 */
	public async handleProfileSwitch(): Promise<void> {
		await this.shutdown();
		await this.connectToActiveProfileServers();
	}

	/**
	 * 关闭所有活动的 MCP 连接。
	 */
	public async shutdown(): Promise<void> {
		for (const connectionInfo of this.activeConnections.values()) {
			await this.disconnectFromServer(connectionInfo.id);
		}
	}

	/**
	 * 获取所有活动连接的工具列表
	 */
	public getAvailableTools(): Tool[] {
		const allTools: Tool[] = [];
		for (const connectionInfo of this.activeConnections.values()) {
			if (connectionInfo.status === ConnectionStatus.CONNECTED) {
				allTools.push(...connectionInfo.tools);
			}
		}
		return allTools;
	}

	/**
	 * 调用MCP工具
	 */
	public async callTool(
		toolName: string,
		arguments_: Record<string, unknown>,
	): Promise<ToolCallResult> {
		// 查找拥有该工具的连接
		for (const connectionInfo of this.activeConnections.values()) {
			if (connectionInfo.status === ConnectionStatus.CONNECTED) {
				const tool = connectionInfo.tools.find(
					(t) => t.name === toolName,
				);
				if (tool) {
					try {
						const result = await connectionInfo.client.callTool({
							name: toolName,
							arguments: arguments_,
						});
						return {
							success: true,
							result: result.content,
						};
					} catch (error) {
						return {
							success: false,
							error:
								error instanceof Error
									? error.message
									: String(error),
						};
					}
				}
			}
		}

		return {
			success: false,
			error: `Tool "${toolName}" not found in any connected server`,
		};
	}

	private async connectToActiveProfileServers(): Promise<void> {
		const activeProfile = this.plugin.profileManager.getActiveProfile();
		const { mcpServerRegistry } = this.plugin.settings;

		if (!activeProfile.enabledMcpServers) return;

		const connectionPromises = activeProfile.enabledMcpServers.map(
			(serverId) => {
				const serverConfig = mcpServerRegistry.find(
					(s) => s.id === serverId,
				);
				if (serverConfig) {
					return this.connectToServer(serverConfig);
				}
				return Promise.resolve();
			},
		);

		await Promise.allSettled(connectionPromises);
	}

	/**
	 * 连接到单个 MCP 服务器。
	 */
	private async connectToServer(
		serverConfig: McpServerConfig,
	): Promise<void> {
		if (this.activeConnections.has(serverConfig.id)) return;

		// 目前只支持 STDIO 连接，SSE 连接需要额外的SDK支持
		if (serverConfig.type === "stdio") {
			await this.connectStdioServer(
				serverConfig as IStdioMcpServerConfig,
			);
		} else {
			console.warn(
				`MCP connection type "${serverConfig.type}" not yet supported`,
			);
		}
	}

	private async connectStdioServer(
		config: IStdioMcpServerConfig,
	): Promise<void> {
		const connectionInfo: McpConnectionInfo = {
			id: config.id,
			config,
			status: ConnectionStatus.CONNECTING,
			client: new Client({ name: "obsidian-copilot", version: "1.0.0" }),
			transport: null,
			tools: [],
		};

		this.activeConnections.set(config.id, connectionInfo);

		try {
			// 确定运行命令
			const isJs =
				config.command.endsWith(".js") ||
				(config.args && config.args.some((arg) => arg.endsWith(".js")));
			const isPy =
				config.command.endsWith(".py") ||
				(config.args && config.args.some((arg) => arg.endsWith(".py")));

			let command = config.command;
			let args = config.args || [];

			// 如果命令本身是脚本文件，需要添加解释器
			if (isPy && !command.includes("python")) {
				args = [command, ...args];
				command = process.platform === "win32" ? "python" : "python3";
			} else if (isJs && !command.includes("node")) {
				args = [command, ...args];
				command = process.execPath; // Node.js 可执行文件路径
			}

			// 创建传输层
			connectionInfo.transport = new StdioClientTransport({
				command,
				args,
				env: config.env,
			});

			// 连接到服务器
			await connectionInfo.client.connect(connectionInfo.transport);

			// 获取工具列表
			const toolsResult = await connectionInfo.client.listTools();
			connectionInfo.tools = toolsResult.tools;
			connectionInfo.status = ConnectionStatus.CONNECTED;

			console.log(
				`[MCP-${config.id}] Connected successfully with tools:`,
				connectionInfo.tools.map((tool) => tool.name),
			);
		} catch (error) {
			connectionInfo.status = ConnectionStatus.ERROR;
			connectionInfo.lastError =
				error instanceof Error ? error.message : String(error);
			console.error(
				`[MCP-${config.id}] Connection failed:`,
				connectionInfo.lastError,
			);
		}
	}

	/**
	 * 断开与单个 MCP 服务器的连接。
	 */
	private async disconnectFromServer(serverId: string): Promise<void> {
		const connectionInfo = this.activeConnections.get(serverId);
		if (!connectionInfo) return;

		try {
			if (connectionInfo.status === ConnectionStatus.CONNECTED) {
				await connectionInfo.client.close();
			}
		} catch (error) {
			console.error(
				`[MCP-${serverId}] Error during disconnection:`,
				error,
			);
		} finally {
			this.activeConnections.delete(serverId);
		}
	}

	/**
	 * 获取连接状态信息（用于调试和状态显示）
	 */
	public getConnectionStatus(): Record<
		string,
		{
			status: ConnectionStatus;
			toolCount: number;
			lastError?: string;
		}
	> {
		const status: Record<string, any> = {};
		for (const [id, connectionInfo] of this.activeConnections.entries()) {
			status[id] = {
				status: connectionInfo.status,
				toolCount: connectionInfo.tools.length,
				lastError: connectionInfo.lastError,
			};
		}
		return status;
	}
}

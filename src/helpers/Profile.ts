import { Notice } from "obsidian";
import CopilotPlugin from "../main";
import { defaultModels } from "../copilot-chat/store/slices/message";

// STDIO连接类型
export interface IStdioMcpServerConfig {
	id: string;
	name: string;
	type: "stdio";
	version?: string;
	command: string;
	args?: string[];
	cwd?: string;
	env?: { [key: string]: string };
	scriptPath?: string;
	filePath?: string;
	description?: string;
}

// SSE连接类型
export interface ISSEMcpServerConfig {
	id: string;
	name: string;
	type: "sse";
	version?: string;
	url: string;
	oauth?: string;
	env?: { [key: string]: string };
	filePath?: string;
	description?: string;
}

// 支持两种类型的MCP服务器
export type McpServerConfig = IStdioMcpServerConfig | ISSEMcpServerConfig;

export interface ProfileSettings {
	name: string;
	systemPrompt: string;
	invertEnterSendBehavior: boolean;
	selectedModel: {
		label: string;
		value: string;
	};
	enabledMcpServers: string[]; // 存储启用的 MCP 服务器 ID
}

export interface AuthSettings {
	deviceCode: string | null;
	pat: string | null;
	accessToken: {
		token: string | null;
		expiresAt: number | null;
	};
}

export interface PluginSettings {
	authSettings: AuthSettings;
	profiles: Record<string, ProfileSettings>;
	activeProfileName: string;
	mcpServerRegistry: McpServerConfig[]; // MCP 服务器注册表
}

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
	deviceCode: null,
	pat: null,
	accessToken: {
		token: null,
		expiresAt: null,
	},
};

export const DEFAULT_PROFILE: ProfileSettings = {
	name: "default",
	systemPrompt:
		"You are GitHub Copilot, an AI assistant. You are helping the user with their tasks in Obsidian.",
	invertEnterSendBehavior: false,
	selectedModel: defaultModels[4],
	enabledMcpServers: [], // 默认不启用任何 MCP 服务器
};

export const DEFAULT_SETTINGS: PluginSettings = {
	authSettings: DEFAULT_AUTH_SETTINGS,
	profiles: {
		default: DEFAULT_PROFILE,
	},
	activeProfileName: "default",
	mcpServerRegistry: [], // 默认空的 MCP 服务器注册表
};

export class ProfileManager {
	private plugin: CopilotPlugin;

	constructor(plugin: CopilotPlugin) {
		this.plugin = plugin;
	}

	getActiveProfile(): ProfileSettings {
		const { profiles, activeProfileName } = this.plugin.settings;
		return profiles[activeProfileName] || DEFAULT_PROFILE;
	}

	async switchProfile(profileName: string): Promise<void> {
		const { profiles } = this.plugin.settings;
		if (!profiles[profileName]) {
			new Notice(`配置文件 "${profileName}" 不存在`);
			return;
		}
		this.plugin.settings.activeProfileName = profileName;
		await this.plugin.saveData(this.plugin.settings);
		new Notice(`已切换到配置文件: ${profileName}`);
	}

	async createProfile(
		profileName: string,
		settings?: Partial<ProfileSettings>,
	): Promise<void> {
		if (!profileName || profileName.trim() === "") {
			new Notice("配置文件名称不能为空");
			return;
		}
		const { profiles } = this.plugin.settings;
		if (profiles[profileName]) {
			new Notice(`配置文件 "${profileName}" 已存在`);
			return;
		}
		profiles[profileName] = {
			...DEFAULT_PROFILE,
			name: profileName,
			...(settings || {}),
		};
		this.plugin.settings.activeProfileName = profileName;
		await this.plugin.saveData(this.plugin.settings);
		new Notice(`已创建并切换到配置文件: ${profileName}`);
	}

	async updateActiveProfile(
		settings: Partial<ProfileSettings>,
	): Promise<void> {
		const activeProfileName = this.plugin.settings.activeProfileName;
		const activeProfile = this.plugin.settings.profiles[activeProfileName];
		if (!activeProfile) {
			new Notice("当前配置文件不存在，无法更新");
			return;
		}
		this.plugin.settings.profiles[activeProfileName] = {
			...activeProfile,
			...settings,
		};
		await this.plugin.saveData(this.plugin.settings);
	}

	async deleteProfile(profileName: string): Promise<void> {
		if (profileName === "default") {
			new Notice("无法删除默认配置文件");
			return;
		}
		const { profiles, activeProfileName } = this.plugin.settings;
		if (!profiles[profileName]) {
			new Notice(`配置文件 "${profileName}" 不存在`);
			return;
		}
		delete profiles[profileName];
		if (activeProfileName === profileName) {
			this.plugin.settings.activeProfileName = "default";
		}
		await this.plugin.saveData(this.plugin.settings);
		new Notice(`已删除配置文件: ${profileName}`);
	}

	// 新增: 添加 MCP 服务器到全局注册表
	async addMcpServer(server: McpServerConfig): Promise<void> {
		const { mcpServerRegistry } = this.plugin.settings;
		
		// 检查 ID 是否已存在
		if (mcpServerRegistry.some(s => s.id === server.id)) {
			new Notice(`MCP 服务器 ID "${server.id}" 已存在`);
			return;
		}
		
		mcpServerRegistry.push(server);
		await this.plugin.saveData(this.plugin.settings);
		new Notice(`已添加 MCP 服务器: ${server.name}`);
	}

	// 新增: 更新 MCP 服务器
	async updateMcpServer(serverId: string, updates: Partial<McpServerConfig>): Promise<void> {
		const { mcpServerRegistry } = this.plugin.settings;
		const serverIndex = mcpServerRegistry.findIndex(s => s.id === serverId);
		
		if (serverIndex === -1) {
			new Notice(`MCP 服务器 ID "${serverId}" 不存在`);
			return;
		}
		
		const updatedType = updates.type ?? mcpServerRegistry[serverIndex].type;
		if (updatedType === "stdio") {
			const updatesStdio = updates as Partial<IStdioMcpServerConfig>;
			const prev = mcpServerRegistry[serverIndex] as IStdioMcpServerConfig;
			mcpServerRegistry[serverIndex] = {
				id: updatesStdio.id ?? prev.id,
				name: updatesStdio.name ?? prev.name,
				type: "stdio",
				version: updatesStdio.version ?? prev.version,
				command: updatesStdio.command ?? prev.command,
				args: updatesStdio.args ?? prev.args,
				cwd: updatesStdio.cwd ?? prev.cwd,
				env: updatesStdio.env ?? prev.env,
				scriptPath: updatesStdio.scriptPath ?? prev.scriptPath,
				filePath: updatesStdio.filePath ?? prev.filePath,
				description: updatesStdio.description ?? prev.description,
			};
		} else if (updatedType === "sse") {
			const updatesSse = updates as Partial<ISSEMcpServerConfig>;
			const prev = mcpServerRegistry[serverIndex] as ISSEMcpServerConfig;
			mcpServerRegistry[serverIndex] = {
				id: updatesSse.id ?? prev.id,
				name: updatesSse.name ?? prev.name,
				type: "sse",
				version: updatesSse.version ?? prev.version,
				url: updatesSse.url ?? prev.url,
				oauth: updatesSse.oauth ?? prev.oauth,
				env: updatesSse.env ?? prev.env,
				filePath: updatesSse.filePath ?? prev.filePath,
				description: updatesSse.description ?? prev.description,
			};
		}
		
		await this.plugin.saveData(this.plugin.settings);
		new Notice(`已更新 MCP 服务器: ${mcpServerRegistry[serverIndex].name}`);
	}

	// 新增: 删除 MCP 服务器
	async deleteMcpServer(serverId: string): Promise<void> {
		const { mcpServerRegistry, profiles } = this.plugin.settings;
		const serverIndex = mcpServerRegistry.findIndex(s => s.id === serverId);
		
		if (serverIndex === -1) {
			new Notice(`MCP 服务器 ID "${serverId}" 不存在`);
			return;
		}
		
		// 从所有 Profile 中移除该服务器的引用
		Object.values(profiles).forEach(profile => {
			// 确保 enabledMcpServers 存在，如果不存在则初始化为空数组
			if (!profile.enabledMcpServers) {
				profile.enabledMcpServers = [];
			} else {
				profile.enabledMcpServers = profile.enabledMcpServers.filter(id => id !== serverId);
			}
		});
		
		// 从注册表中删除
		mcpServerRegistry.splice(serverIndex, 1);
		await this.plugin.saveData(this.plugin.settings);
		new Notice(`已删除 MCP 服务器`);
	}

	// 新增: 为当前 Profile 启用/禁用 MCP 服务器
	async toggleMcpServerForActiveProfile(serverId: string, enabled: boolean): Promise<void> {
		const activeProfile = this.getActiveProfile();
		const { mcpServerRegistry } = this.plugin.settings;
		
		// 检查服务器是否存在
		if (!mcpServerRegistry.some(s => s.id === serverId)) {
			new Notice(`MCP 服务器 ID "${serverId}" 不存在`);
			return;
		}
		
		// 确保 enabledMcpServers 存在
		if (!activeProfile.enabledMcpServers) {
			activeProfile.enabledMcpServers = [];
		}
		
		if (enabled) {
			// 添加到已启用列表（如果不存在）
			if (!activeProfile.enabledMcpServers.includes(serverId)) {
				await this.updateActiveProfile({
					enabledMcpServers: [...activeProfile.enabledMcpServers, serverId]
				});
				new Notice(`已为当前配置文件启用 MCP 服务器`);
			}
		} else {
			// 从已启用列表中移除
			if (activeProfile.enabledMcpServers.includes(serverId)) {
				await this.updateActiveProfile({
					enabledMcpServers: activeProfile.enabledMcpServers.filter(id => id !== serverId)
				});
				new Notice(`已为当前配置文件禁用 MCP 服务器`);
			}
		}
	}

	async migrateFromOldSettings(oldSettings: any): Promise<PluginSettings> {
		const newSettings: PluginSettings = {
			authSettings: DEFAULT_AUTH_SETTINGS,
			profiles: {
				default: DEFAULT_PROFILE,
			},
			activeProfileName: "default",
			mcpServerRegistry: [], // 新增空的 MCP 服务器注册表
		};
		if (oldSettings.chatSettings) {
			newSettings.authSettings = {
				deviceCode: oldSettings.chatSettings.deviceCode || null,
				pat: oldSettings.chatSettings.pat || null,
				accessToken: {
					token: oldSettings.chatSettings.accessToken?.token || null,
					expiresAt:
						oldSettings.chatSettings.accessToken?.expiresAt || null,
				},
			};
		}
		newSettings.profiles.default = {
			name: "default",
			systemPrompt:
				oldSettings.systemPrompt || DEFAULT_PROFILE.systemPrompt,
			invertEnterSendBehavior:
				oldSettings.invertEnterSendBehavior !== undefined
					? oldSettings.invertEnterSendBehavior
					: DEFAULT_PROFILE.invertEnterSendBehavior,
			selectedModel:
				oldSettings.chatSettings?.selectedModel ||
				DEFAULT_PROFILE.selectedModel,
			enabledMcpServers: [], // 新增空的已启用 MCP 服务器列表
		};
		return newSettings;
	}
}

import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	ProfileManager,
	PluginSettings,
	DEFAULT_SETTINGS,
} from "./helpers/Profile";

import CopilotPluginSettingTab from "./settings/CopilotPluginSettingTab";
import ChatView from "./copilot-chat/views/ChatView";
import { McpManager } from "./mcp/McpManager";

import { CHAT_VIEW_TYPE } from "./copilot-chat/types/constants";

export default class CopilotPlugin extends Plugin {
	settingsTab: CopilotPluginSettingTab;
	settings: PluginSettings;
	profileManager: ProfileManager;
	mcpManager: McpManager; // 添加 McpManager 实例

	async onload() {
		await this.loadSettings();
		this.profileManager = new ProfileManager(this);
		this.mcpManager = new McpManager(this); // 实例化 McpManager
		await this.mcpManager.initialize(); // 初始化 MCP 连接

		this.settingsTab = new CopilotPluginSettingTab(this.app, this);
		this.addSettingTab(this.settingsTab);

		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
		this.activateView();

		this.addCommand({
			id: "open-copilot-chat",
			name: "Open Copilot Chat",
			callback: () => {
				this.activateView();
				const leaves =
					this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
				if (leaves.length > 0) {
					this.app.workspace.revealLeaf(leaves[0]);
				}
			},
		});
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		// 检查是否需要迁移旧版配置
		if (loadedData && !loadedData.profiles) {
			this.profileManager = new ProfileManager(this);
			this.settings =
				await this.profileManager.migrateFromOldSettings(loadedData);
			await this.saveData(this.settings);
		} else {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// 配置文件切换后通知聊天视图和 McpManager 刷新
	public async handleProfileSwitch(): Promise<void> {
		await this.mcpManager.handleProfileSwitch(); // 通知 McpManager 处理配置切换

		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length > 0) {
			const view = leaves[0].view as ChatView;
			if (view && typeof view.updateForProfileSwitch === "function") {
				view.updateForProfileSwitch();
			}
		}
	}

	onunload() {
		this.mcpManager.shutdown(); // 在插件卸载时关闭所有 MCP 连接
		this.deactivateView();
	}

	async activateView(): Promise<void> {
		const workspace = this.app.workspace;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		}
	}

	deactivateView() {
		this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
	}
}

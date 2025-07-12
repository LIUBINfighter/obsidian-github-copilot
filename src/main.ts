import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	ProfileManager,
	PluginSettings,
	DEFAULT_SETTINGS,
} from "./helpers/Profile";

import CopilotPluginSettingTab from "./settings/CopilotPluginSettingTab";
import ChatView from "./copilot-chat/views/ChatView";

import { CHAT_VIEW_TYPE } from "./copilot-chat/types/constants";

export default class CopilotPlugin extends Plugin {
	settingsTab: CopilotPluginSettingTab;
	settings: PluginSettings;
	profileManager: ProfileManager;

	async onload() {
		await this.loadSettings();
		this.profileManager = new ProfileManager(this);
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

	// 配置文件切换后通知聊天视图刷新
	public handleProfileSwitch(): void {
		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length > 0) {
			const view = leaves[0].view as ChatView;
			if (view && typeof view.updateForProfileSwitch === "function") {
				view.updateForProfileSwitch();
			}
		}
	}

	onunload() {
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

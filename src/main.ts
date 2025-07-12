import { Plugin, WorkspaceLeaf } from "obsidian";

import CopilotPluginSettingTab, { CopilotPluginSettings, DEFAULT_SETTINGS } from "./settings/CopilotPluginSettingTab";
import ChatView from "./copilot-chat/views/ChatView";

import { CHAT_VIEW_TYPE } from "./copilot-chat/types/constants";

export default class CopilotPlugin extends Plugin {
	settingsTab: CopilotPluginSettingTab;
	settings: CopilotPluginSettings;

	async onload() {
		await this.loadSettings();
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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

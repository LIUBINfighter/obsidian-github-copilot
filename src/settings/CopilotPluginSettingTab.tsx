import { App, Notice, PluginSettingTab, Setting, debounce } from "obsidian";
import CopilotPlugin from "../main";
import { defaultModels } from "../copilot-chat/store/slices/message";

export type CopilotChatSettings = {
	deviceCode: string | null;
	pat: string | null;
	accessToken: {
		token: string | null;
		expiresAt: number | null;
	};
	selectedModel?: {
		label: string;
		value: string;
	};
};

export interface CopilotPluginSettings {
	chatSettings?: CopilotChatSettings;
	systemPrompt: string;
	invertEnterSendBehavior: boolean;
}

export const DEFAULT_SETTINGS: CopilotPluginSettings = {
	chatSettings: {
		deviceCode: null,
		pat: null,
		accessToken: {
			token: null,
			expiresAt: null,
		},
		selectedModel: defaultModels[4],
	},
	systemPrompt:
		"You are GitHub Copilot, an AI assistant. You are helping the user with their tasks in Obsidian.",
	invertEnterSendBehavior: false,
};

class CopilotPluginSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h1", { text: "Copilot Chat Settings" });

		new Setting(containerEl)
			.setName("Send Message Key")
			.setDesc(
				"Choose which key sends the message: Enter or Shift+Enter.",
			)
			.addDropdown((dropdown) => {
				dropdown.addOption(
					"enter",
					"Enter to send, Shift+Enter for newline",
				);
				dropdown.addOption(
					"shift+enter",
					"Shift+Enter to send, Enter for newline",
				);
				dropdown.setValue(
					this.plugin.settings.invertEnterSendBehavior
						? "shift+enter"
						: "enter",
				);
				dropdown.onChange(async (value) => {
					this.plugin.settings.invertEnterSendBehavior =
						value === "shift+enter";
					await this.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc(
				"Configure the system prompt used for new chat conversations.",
			)
			.addTextArea((text) => {
				text.inputEl.rows = 4;
				text.inputEl.cols = 50;
				return text
					.setPlaceholder("Enter a system prompt for Copilot Chat.")
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(
						debounce(
							async (value) => {
								this.plugin.settings.systemPrompt = value;
								await this.saveSettings();
							},
							1000,
							true,
						),
					);
			});
	}

	public async loadSettings() {
		this.plugin.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.plugin.loadData(),
		);
	}

	public async saveSettings(): Promise<void> {
		await this.plugin.saveData(this.plugin.settings);
		await this.loadSettings();
		new Notice("Settings saved successfully.");
	}
}

export default CopilotPluginSettingTab;

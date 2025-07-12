import { App, Notice, PluginSettingTab, Setting, debounce } from "obsidian";
import { StrictMode } from "react";
import { Root, createRoot } from "react-dom/client";

import CopilotPlugin from "../main";
import AuthModal from "../modal/AuthModal";
import KeybindingInput from "../components/KeybindingInput";
import AutocompleteInput from "../components/AutocompleteInput";
import Node from "../helpers/Node";
import Logger from "../helpers/Logger";
import File from "../helpers/File";
import Json from "../helpers/Json";
import Vault from "../helpers/Vault";
import { defaultModels } from "../copilot-chat/store/slices/message";

export interface SettingsObserver {
	onSettingsUpdate(): Promise<void>;
}

export type Hotkeys = {
	accept: string;
	cancel: string;
	request: string;
	partial: string;
	next: string;
	disable: string;
};

export type CopilotChatSettings = {
	deviceCode: string | null;
	pat: string | null; // Personal Access Token to create the access token
	// Access token to authenticate the user
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
	nodePath: string;
	nodePathUpdatedToNode20: boolean;
	enabled: boolean;
	hotkeys: Hotkeys;
	suggestionDelay: number;
	debug: boolean;
	onlyOnHotkey: boolean;
	onlyInCodeBlock: boolean;
	exclude: string[];
	deviceSpecificSettings: string[];
	useDeviceSpecificSettings: boolean;
	proxy: string;
	chatSettings?: CopilotChatSettings;
	systemPrompt: string;
	invertEnterSendBehavior: boolean;
	extraCACerts?: string;
}

export const DEFAULT_SETTINGS: CopilotPluginSettings = {
	nodePath: "default",
	nodePathUpdatedToNode20: false,
	enabled: true,
	hotkeys: {
		accept: "Tab",
		cancel: "Escape",
		request: "Cmd-Shift-/",
		partial: "Cmd-Shift-.",
		next: "Cmd-Shift-ArrowDown",
		disable: "Cmd-Shift-ArrowRight",
	},
	suggestionDelay: 500,
	debug: false,
	onlyOnHotkey: false,
	onlyInCodeBlock: false,
	exclude: [],
	deviceSpecificSettings: ["nodePath"],
	useDeviceSpecificSettings: false,
	proxy: "",
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
	extraCACerts: "",
};

class CopilotPluginSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;
	private observers: SettingsObserver[] = [];
	root: Root | null = null;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// ...existing code...

		containerEl.createEl("h1", { text: "Copilot Chat Settings" });

		new Setting(containerEl)
			.setName("Invert Enter/Shift+Enter behavior")
			.setDesc(
				"When enabled, pressing Enter will create a new line and Shift+Enter will send the message. By default, Enter sends the message and Shift+Enter creates a new line.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.invertEnterSendBehavior)
					.onChange(async (value) => {
						this.plugin.settings.invertEnterSendBehavior = value;
						await this.saveSettings();
					}),
			);

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
								await this.saveSettings(false, true);
							},
							1000,
							true,
						),
					);
			});
	}

	public hide(): void {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	public async loadSettings() {
		const defaultSettings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.plugin.loadData(),
		);
		if (defaultSettings.useDeviceSpecificSettings) {
			this.plugin.settings = Object.assign(
				{},
				defaultSettings,
				Json.textToJsonObject(
					File.readFileSync(
						Vault.getPluginPath(this.plugin.app) +
							"/device_data.json",
					),
				) || {},
			);
		} else {
			this.plugin.settings = defaultSettings;
		}
	}

	public async saveSettings(
		notify = true,
		notice = true,
	): Promise<void | void[]> {
		if (this.plugin.settings.useDeviceSpecificSettings) {
			File.writeFileSync(
				Vault.getPluginPath(this.plugin.app) + "/device_data.json",
				Json.jsonObjectToText(
					Json.onlyKeepProperties(
						this.plugin.settings,
						this.plugin.settings.deviceSpecificSettings,
					),
				),
			);
		}
		await this.plugin.saveData(this.plugin.settings);
		await this.loadSettings();
		if (notice) new Notice("Settings saved successfully.");
		if (notify) return this.notifyObservers();
		return Promise.resolve();
	}

	public isCopilotEnabled(): boolean {
		return (
			this.plugin.settings.enabled &&
			this.plugin.settings.nodePath !== "" &&
			this.plugin.settings.nodePath !== DEFAULT_SETTINGS.nodePath
		);
	}

	public async isCopilotEnabledWithPathCheck(): Promise<boolean> {
		return (
			this.isCopilotEnabled() &&
			(await Node.testNodePath(this.plugin.settings.nodePath, true).then(
				async (path) => {
					if (!path) return false;
					if (path) {
						this.plugin.settings.nodePathUpdatedToNode20 = true;
						await this.saveSettings(false, false);
					}
					return true;
				},
			))
		);
	}

	private async needCopilotAgentEnabled(callback: () => void) {
		if (!this.plugin.settings.enabled) {
			this.plugin.settings.enabled = true;
			await this.saveSettings(true, false).then(() => {
				callback();
			});
		} else {
			callback();
		}
	}

	private async initSignIn() {
		await this.plugin.copilotAgent
			.getClient()
			.initiateSignIn()
			.then((res) => {
				if (res.status === "AlreadySignedIn") {
					new Notice("You are already signed in.");
				} else {
					new AuthModal(
						this.plugin,
						res.userCode,
						res.verificationUri,
					).open();
				}
			});
	}

	private async signOut() {
		await this.plugin.copilotAgent
			.getClient()
			.signOut()
			.then(() => {
				new Notice("Signed out successfully.");
			});
	}

	public registerObserver(observer: SettingsObserver) {
		this.observers.push(observer);
	}

	private notifyObservers(): Promise<void[]> {
		return Promise.all(
			this.observers.map((observer) => observer.onSettingsUpdate()),
		);
	}
}

export default CopilotPluginSettingTab;

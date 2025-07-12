import { Notice } from "obsidian";
import CopilotPlugin from "../main";
import { defaultModels } from "../copilot-chat/store/slices/message";

export interface ProfileSettings {
	name: string;
	systemPrompt: string;
	invertEnterSendBehavior: boolean;
	selectedModel: {
		label: string;
		value: string;
	};
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
};

export const DEFAULT_SETTINGS: PluginSettings = {
	authSettings: DEFAULT_AUTH_SETTINGS,
	profiles: {
		default: DEFAULT_PROFILE,
	},
	activeProfileName: "default",
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

	async migrateFromOldSettings(oldSettings: any): Promise<PluginSettings> {
		const newSettings: PluginSettings = {
			authSettings: DEFAULT_AUTH_SETTINGS,
			profiles: {
				default: DEFAULT_PROFILE,
			},
			activeProfileName: "default",
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
		};
		return newSettings;
	}
}

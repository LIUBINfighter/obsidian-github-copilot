import { StateCreator } from "zustand";
import { Notice } from "obsidian";
import CopilotPlugin from "../../../main";
import { AuthSettings } from "../../../helpers/Profile";
import {
	fetchDeviceCode,
	fetchPAT,
	fetchToken,
	DeviceCodeResponse,
	PATResponse,
	TokenResponse,
} from "../../api";

export interface AuthSlice {
	deviceCode: AuthSettings["deviceCode"];
	pat: AuthSettings["pat"];
	accessToken: AuthSettings["accessToken"];
	isAuthenticated: boolean;
	isLoadingDeviceCode: boolean;
	isLoadingPAT: boolean;
	isLoadingToken: boolean;
	deviceCodeData: DeviceCodeResponse | null;

	initAuthService: (plugin: CopilotPlugin) => void;
	checkAndRefreshToken: (plugin: CopilotPlugin) => Promise<string | null>;

	setDeviceCode: (plugin: CopilotPlugin, code: string) => void;
	setPAT: (plugin: CopilotPlugin, pat: string) => void;
	setAccessToken: (
		plugin: CopilotPlugin,
		token: AuthSettings["accessToken"],
	) => void;

	fetchDeviceCode: (
		plugin: CopilotPlugin,
	) => Promise<DeviceCodeResponse | null>;
	fetchPAT: (
		plugin: CopilotPlugin,
		deviceCode: string,
	) => Promise<PATResponse | null>;
	fetchToken: (
		plugin: CopilotPlugin,
		pat: string,
	) => Promise<TokenResponse | null>;

	reset: (plugin: CopilotPlugin) => void;
}

const defaultAuthSettings = {
	deviceCode: null,
	pat: null,
	accessToken: {
		token: null,
		expiresAt: 0,
	},
};

const isTokenExpired = (expiresAt: number): boolean => {
	return Date.now() >= expiresAt * 1000;
};

export const createAuthSlice: StateCreator<AuthSlice> = (set, get) => ({
	deviceCode: null,
	pat: null,
	accessToken: {
		token: null,
		expiresAt: 0,
	},
	isAuthenticated: false,
	isLoadingDeviceCode: false,
	isLoadingPAT: false,
	isLoadingToken: false,
	deviceCodeData: null,

	initAuthService: async (plugin: CopilotPlugin) => {
		const authSettings =
			plugin.settings.authSettings || defaultAuthSettings;

		set({
			deviceCode: authSettings.deviceCode,
			pat: authSettings.pat,
			accessToken: authSettings.accessToken || {
				token: null,
				expiresAt: 0,
			},
		});

		if (
			authSettings.pat &&
			(!authSettings.accessToken?.token ||
				isTokenExpired(authSettings.accessToken?.expiresAt || 0))
		) {
			try {
				await get().fetchToken(plugin, authSettings.pat);
			} catch (error) {
				console.error("Failed to refresh token during init:", error);
			}
		} else {
			set({
				isAuthenticated: !!(
					authSettings.deviceCode &&
					authSettings.pat &&
					authSettings.accessToken?.token &&
					!isTokenExpired(authSettings.accessToken?.expiresAt || 0)
				),
			});
		}
	},

	checkAndRefreshToken: async (plugin: CopilotPlugin) => {
		const { accessToken, pat } = get();

		if (!accessToken.token || isTokenExpired(accessToken.expiresAt || 0)) {
			console.log("Token expired or about to expire, refreshing...");

			if (!pat) {
				console.error("Cannot refresh token: No PAT available");
				return null;
			}

			try {
				const data = await get().fetchToken(plugin, pat);
				return data?.token || null;
			} catch (error) {
				console.error("Failed to refresh token:", error);
				return null;
			}
		}

		return accessToken.token;
	},

	setDeviceCode: async (plugin: CopilotPlugin, code: string) => {
		if (plugin) {
			console.log("setDeviceCode", code);

			if (!plugin.settings.authSettings) {
				plugin.settings.authSettings = { ...defaultAuthSettings };
			}

			plugin.settings.authSettings.deviceCode = code;
			await plugin.saveData(plugin.settings);
		}
		set({ deviceCode: code });
	},

	setPAT: async (plugin: CopilotPlugin, pat: string) => {
		if (plugin) {
			console.log("setPAT", pat);

			if (!plugin.settings.authSettings) {
				plugin.settings.authSettings = { ...defaultAuthSettings };
			}

			plugin.settings.authSettings.pat = pat;
			// 保证 deviceCode 也能被正确写入（如有需要）
			if (plugin.settings.authSettings.deviceCode === undefined) {
				plugin.settings.authSettings.deviceCode = null;
			}
			await plugin.saveData(plugin.settings);
		}
		set({ pat: pat });
	},

	setAccessToken: async (
		plugin: CopilotPlugin,
		token: AuthSettings["accessToken"],
	) => {
		if (plugin) {
			console.log("setAccessToken", token);

			if (!plugin.settings.authSettings) {
				plugin.settings.authSettings = { ...defaultAuthSettings };
			}

			plugin.settings.authSettings.accessToken = token;
			await plugin.saveData(plugin.settings);
		}
		set({
			accessToken: token,
			isAuthenticated:
				!!token.token && !isTokenExpired(token.expiresAt || 0),
		});
	},

	fetchDeviceCode: async (plugin: CopilotPlugin) => {
		set({ isLoadingDeviceCode: true });

		try {
			const data = await fetchDeviceCode();
			console.log("Device code data", data);

			await get().setDeviceCode(plugin, data.device_code);
			set({ deviceCodeData: data });

			return data;
		} catch (error) {
			console.error("Error fetching device code:", error);
			new Notice("Failed to fetch device code. Please try again.");
			throw error;
		} finally {
			set({ isLoadingDeviceCode: false });
		}
	},

	fetchPAT: async (plugin: CopilotPlugin, deviceCode: string) => {
		set({ isLoadingPAT: true });

		try {
			const data = await fetchPAT(deviceCode);
			console.log("PAT data", data);

			await get().setPAT(plugin, data.access_token);

			if (data.access_token) {
				await get().fetchToken(plugin, data.access_token);
			}

			return data;
		} catch (error) {
			console.error("Error fetching PAT:", error);
			new Notice("Failed to fetch PAT. Please try again.");
			throw error;
		} finally {
			set({ isLoadingPAT: false });
		}
	},

	fetchToken: async (plugin: CopilotPlugin, pat: string) => {
		set({ isLoadingToken: true });

		try {
			const data = await fetchToken(pat);
			console.log("Token data", data);

			await get().setAccessToken(plugin, {
				token: data.token,
				expiresAt: data.expires_at,
			});

			return data;
		} catch (error) {
			console.error("Error fetching token:", error);
			new Notice("Failed to fetch token. Please try again.");
			throw error;
		} finally {
			set({ isLoadingToken: false });
		}
	},

	reset: (plugin: CopilotPlugin) => {
		console.log("reset");
		set({
			deviceCode: null,
			pat: null,
			accessToken: {
				token: null,
				expiresAt: 0,
			},
			isAuthenticated: false,
			deviceCodeData: null,
		});

		if (!plugin.settings.authSettings) {
			plugin.settings.authSettings = { ...defaultAuthSettings };
		} else {
			plugin.settings.authSettings.deviceCode = null;
			plugin.settings.authSettings.pat = null;
			plugin.settings.authSettings.accessToken = {
				token: null,
				expiresAt: 0,
			};
		}
		plugin.saveData(plugin.settings);
	},
});

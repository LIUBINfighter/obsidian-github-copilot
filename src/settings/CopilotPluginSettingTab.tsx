import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	debounce,
} from "obsidian";
import CopilotPlugin from "../main";
import { ProfileSettings } from "../helpers/Profile";

// 创建配置文件的模态窗口
class CreateProfileModal extends Modal {
	plugin: CopilotPlugin;
	onSubmit: (name: string) => void;

	constructor(
		app: App,
		plugin: CopilotPlugin,
		onSubmit: (name: string) => void,
	) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "创建新的配置文件" });

		const inputContainer = contentEl.createDiv();
		const input = inputContainer.createEl("input", {
			type: "text",
			placeholder: "输入配置文件名称",
		});
		input.style.width = "100%";
		input.style.marginBottom = "20px";

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "取消",
		});
		cancelButton.addEventListener("click", () => this.close());

		const submitButton = buttonContainer.createEl("button", {
			cls: "mod-cta",
			text: "创建",
		});
		submitButton.addEventListener("click", () => {
			const name = input.value.trim();
			if (name) {
				this.onSubmit(name);
				this.close();
			} else {
				new Notice("配置文件名称不能为空");
			}
		});

		input.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class CopilotPluginSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	activeTab: "global" | "profile" = "global";

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 顶部标签页导航
		const tabBar = containerEl.createDiv({ cls: "copilot-setting-tabs" });
		const globalTab = tabBar.createSpan({
			text: "全局设置",
			cls:
				this.activeTab === "global"
					? "copilot-tab-active"
					: "copilot-tab",
		});
		const profileTab = tabBar.createSpan({
			text: "Profile设置",
			cls:
				this.activeTab === "profile"
					? "copilot-tab-active"
					: "copilot-tab",
		});

		globalTab.onclick = () => {
			this.activeTab = "global";
			this.display();
		};
		profileTab.onclick = () => {
			this.activeTab = "profile";
			this.display();
		};

		// 渲染内容
		if (this.activeTab === "global") {
			this.renderGlobalSettings(containerEl);
		} else {
			this.renderProfileSettings(containerEl);
		}
	}

	renderGlobalSettings(containerEl: HTMLElement) {
		containerEl.createEl("h1", { text: "Copilot Chat 全局设置" });
		// ...可在此处添加全局设置项（如 MCP Server、Token 等）...
		containerEl.createEl("p", {
			text: "此处为全局设置区块，可扩展更多内容。",
		});
	}

	renderProfileSettings(containerEl: HTMLElement) {
		const activeProfile = this.plugin.profileManager.getActiveProfile();
		const { profiles, activeProfileName } = this.plugin.settings;

		containerEl.createEl("h1", { text: "Copilot Chat Profile 设置" });

		new Setting(containerEl)
			.setName("当前配置文件")
			.setDesc("选择或创建不同的配置文件来满足不同场景的需求")
			.addDropdown((dropdown) => {
				Object.keys(profiles).forEach((profileName) => {
					dropdown.addOption(profileName, profileName);
				});
				dropdown.setValue(activeProfileName);
				dropdown.onChange(async (value) => {
					await this.plugin.profileManager.switchProfile(value);
					this.plugin.handleProfileSwitch();
					this.display();
				});
			})
			.addButton((button) => {
				button
					.setButtonText("新建")
					.setTooltip("创建新的配置文件")
					.onClick(() => {
						new CreateProfileModal(
							this.app,
							this.plugin,
							async (name) => {
								await this.plugin.profileManager.createProfile(
									name,
									{
										...activeProfile,
										name: name,
									},
								);
								this.display();
							},
						).open();
					});
			})
			.addButton((button) => {
				button
					.setButtonText("删除")
					.setTooltip("删除当前配置文件")
					.setDisabled(activeProfileName === "default")
					.onClick(async () => {
						if (
							confirm(
								`确定要删除配置文件 "${activeProfileName}" 吗？`,
							)
						) {
							await this.plugin.profileManager.deleteProfile(
								activeProfileName,
							);
							this.display();
						}
					});
			});

		containerEl.createEl("h2", { text: `"${activeProfileName}" 配置` });

		new Setting(containerEl)
			.setName("发送消息按键")
			.setDesc("选择哪个按键发送消息：Enter 或 Shift+Enter")
			.addDropdown((dropdown) => {
				dropdown.addOption("enter", "按 Enter 发送，Shift+Enter 换行");
				dropdown.addOption(
					"shift+enter",
					"按 Shift+Enter 发送，Enter 换行",
				);
				dropdown.setValue(
					activeProfile.invertEnterSendBehavior
						? "shift+enter"
						: "enter",
				);
				dropdown.onChange(async (value) => {
					await this.plugin.profileManager.updateActiveProfile({
						invertEnterSendBehavior: value === "shift+enter",
					});
				});
			});

		new Setting(containerEl)
			.setName("系统提示词")
			.setDesc("配置新聊天对话使用的系统提示词")
			.addTextArea((text) => {
				text.inputEl.rows = 4;
				text.inputEl.cols = 50;
				return text
					.setPlaceholder("输入 Copilot Chat 的系统提示词")
					.setValue(activeProfile.systemPrompt)
					.onChange(
						debounce(
							async (value) => {
								await this.plugin.profileManager.updateActiveProfile(
									{
										systemPrompt: value,
									},
								);
							},
							1000,
							true,
						),
					);
			});
	}
}

export default CopilotPluginSettingTab;

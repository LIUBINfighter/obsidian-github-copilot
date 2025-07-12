import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	debounce,
} from "obsidian";
import CopilotPlugin from "../main";
import { ProfileSettings, McpServerConfig } from "../helpers/Profile";

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
	showAddServerForm: boolean = false;
	editingServer?: McpServerConfig;

	// 用于存储服务器表单的临时数据
	serverFormData: {
		id: string;
		name: string;
		scriptPath: string;
		startCommand: string;
		description: string;
		args: string[];
	} = {
		id: "",
		name: "",
		scriptPath: "",
		startCommand: "",
		description: "",
		args: [],
	};

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

		// MCP 服务器注册表
		containerEl.createEl("h2", { text: "MCP 服务器注册表" });
		containerEl.createEl("p", {
			text: "在此管理所有可用的 MCP 服务器。这些服务器可以在各个 Profile 中选择性地启用。",
		});

		// 显示现有的 MCP 服务器列表
		const { mcpServerRegistry } = this.plugin.settings;

		// 添加服务器列表
		if (mcpServerRegistry.length > 0) {
			const serverListContainer = containerEl.createDiv({
				cls: "copilot-server-list",
			});

			mcpServerRegistry.forEach((server, index) => {
				const serverItem = serverListContainer.createDiv({
					cls: "copilot-server-item",
				});

				const setting = new Setting(serverItem)
					.setName(server.name)
					.setDesc(server.description || `ID: ${server.id}`);
				
				// 如果有参数，显示参数信息
				if (server.args && server.args.length > 0) {
					const argsEl = serverItem.createDiv({
						cls: "copilot-server-args",
					});
					argsEl.createEl("span", {
						text: "参数: " + server.args.join(" "),
						cls: "copilot-server-args-text",
					});
				}
				
				setting.addButton((button) => {
						button.setButtonText("编辑").onClick(() => {
							// 编辑服务器
							this.showAddServerForm = true;
							this.editingServer = server;
							this.serverFormData = {
								id: server.id,
								name: server.name,
								scriptPath: server.scriptPath || "",
								startCommand: server.startCommand || "",
								description: server.description || "",
								args: server.args || [],
							};
							this.display();
						});
					})
					.addButton((button) => {
						button.setButtonText("删除").onClick(async () => {
							if (
								confirm(
									`确定要删除服务器 "${server.name}" 吗？`,
								)
							) {
								await this.plugin.profileManager.deleteMcpServer(
									server.id,
								);
								this.display();
							}
						});
					});
			});
		} else {
			containerEl.createEl("p", {
				text: "当前没有注册的 MCP 服务器。",
				cls: "copilot-empty-message",
			});
		}

		// 添加新服务器按钮
		new Setting(containerEl).addButton((button) => {
			button
				.setButtonText("添加 MCP 服务器")
				.setCta()
				.onClick(() => {
					// 显示添加服务器的表单
					this.showAddServerForm = true;
					this.editingServer = undefined;
					this.serverFormData = {
						id: "",
						name: "",
						scriptPath: "",
						startCommand: "",
						description: "",
						args: [],
					};
					this.display();
				});
		});

		// 如果显示添加/编辑服务器表单
		if (this.showAddServerForm) {
			const formContainer = containerEl.createDiv({
				cls: "copilot-server-form",
			});

			formContainer.createEl("h3", {
				text: this.editingServer
					? "编辑 MCP 服务器"
					: "添加 MCP 服务器",
			});

			// 服务器名称
			const nameContainer = formContainer.createDiv();
			nameContainer.createEl("label", { text: "服务器名称" });
			const nameInput = nameContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.name,
				placeholder: "输入服务器名称",
			});
			nameInput.style.width = "100%";
			nameInput.style.marginBottom = "10px";
			nameInput.addEventListener("input", (e) => {
				const target = e.target as HTMLInputElement;
				this.serverFormData.name = target.value;
			});

			// 服务器 ID
			const idContainer = formContainer.createDiv();
			idContainer.createEl("label", { text: "服务器 ID" });
			const idInput = idContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.id,
				placeholder: "输入唯一 ID",
			});
			idInput.style.width = "100%";
			idInput.style.marginBottom = "10px";
			if (this.editingServer) {
				idInput.disabled = true; // 编辑时不允许修改ID
			}
			idInput.addEventListener("input", (e) => {
				this.serverFormData.id = (e.target as HTMLInputElement).value;
			});

			// 脚本路径
			const scriptPathContainer = formContainer.createDiv();
			scriptPathContainer.createEl("label", { text: "脚本路径" });
			const scriptPathInput = scriptPathContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.scriptPath,
				placeholder: "输入脚本路径",
			});
			scriptPathInput.style.width = "100%";
			scriptPathInput.style.marginBottom = "10px";
			scriptPathInput.addEventListener("input", (e) => {
				this.serverFormData.scriptPath = (
					e.target as HTMLInputElement
				).value;
			});

			// 启动命令
			const startCommandContainer = formContainer.createDiv();
			startCommandContainer.createEl("label", {
				text: "启动命令 (可选)",
			});
			const startCommandInput = startCommandContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.startCommand,
				placeholder: "输入启动命令",
			});
			startCommandInput.style.width = "100%";
			startCommandInput.style.marginBottom = "10px";
			startCommandInput.addEventListener("input", (e) => {
				this.serverFormData.startCommand = (
					e.target as HTMLInputElement
				).value;
			});

			// 描述
			const descContainer = formContainer.createDiv();
			descContainer.createEl("label", { text: "描述 (可选)" });
			const descInput = descContainer.createEl("textarea", {});
			descInput.value = this.serverFormData.description;
			descInput.placeholder = "输入服务器描述";
			descInput.style.width = "100%";
			descInput.style.height = "80px";
			descInput.style.marginBottom = "20px";
			descInput.addEventListener("input", (e) => {
				this.serverFormData.description = (
					e.target as HTMLTextAreaElement
				).value;
			});

			// 参数列表
			const argsContainer = formContainer.createDiv();
			argsContainer.createEl("label", { text: "命令参数 (每行一个)" });
			const argsInput = argsContainer.createEl("textarea", {});
			argsInput.value = this.serverFormData.args.join("\n");
			argsInput.placeholder = "每行输入一个参数";
			argsInput.style.width = "100%";
			argsInput.style.height = "80px";
			argsInput.style.marginBottom = "20px";
			argsInput.addEventListener("input", (e) => {
				const value = (e.target as HTMLTextAreaElement).value;
				// 按行分割，并过滤掉空行
				this.serverFormData.args = value
					.split("\n")
					.map(line => line.trim())
					.filter(line => line.length > 0);
			});

			// 按钮
			const buttonContainer = formContainer.createDiv({
				cls: "modal-button-container",
			});

			const cancelButton = buttonContainer.createEl("button", {
				text: "取消",
			});
			cancelButton.addEventListener("click", () => {
				this.showAddServerForm = false;
				this.editingServer = undefined;
				this.display();
			});

			const submitButton = buttonContainer.createEl("button", {
				cls: "mod-cta",
				text: this.editingServer ? "更新" : "添加",
			});
			submitButton.addEventListener("click", async () => {
				await this.handleServerFormSubmit();
			});
		}

		// 添加 MCP 服务器下拉栏
		const presetServers = [
			{
				id: "context7",
				name: "Context7 MCP",
				command: "npx",
				args: ["-y", "@upstash/context7-mcp@latest"],
				description: "Upstash Context7 MCP 服务器",
				type: "stdio",
			},
			{
				id: "deepwiki-sse",
				name: "Deepwiki SSE",
				command: "",
				args: [],
				description: "Deepwiki SSE MCP 服务器",
				type: "http",
				url: "https://mcp.deepwiki.com/sse",
			},
			// 可继续添加其他预设
		];

		new Setting(containerEl)
			.setName("快速添加 MCP 服务器")
			.setDesc("选择一个预设服务器快速添加到注册表")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "请选择");
				presetServers.forEach((server) => {
					dropdown.addOption(server.id, server.name);
				});
				dropdown.onChange(async (value) => {
					if (!value) return;
					const selected = presetServers.find((s) => s.id === value);
					if (!selected) return;

					// 检查是否已存在
					if (
						this.plugin.settings.mcpServerRegistry.some(
							(s) => s.id === selected.id,
						)
					) {
						new Notice(`ID "${selected.id}" 已存在`);
						return;
					}

					await this.plugin.profileManager.addMcpServer({
						id: selected.id,
						name: selected.name,
						scriptPath: "",
						startCommand: selected.command,
						description: selected.description,
					});
					this.display();
				});
			});
	}

	// // 打开 MCP 服务器编辑/添加模态窗口
	// private openMcpServerModal(server?: McpServerConfig) {
	// 	const modal = new Modal(this.app);
	// 	modal.titleEl.setText(server ? "编辑 MCP 服务器" : "添加 MCP 服务器");

	// 	const contentEl = modal.contentEl;

	// 	// 服务器名称
	// 	const nameContainer = contentEl.createDiv();
	// 	nameContainer.createEl("label", { text: "服务器名称" });
	// 	const nameInput = nameContainer.createEl("input", {
	// 		type: "text",
	// 		value: server?.name || "",
	// 		placeholder: "输入服务器名称",
	// 	});
	// 	nameInput.style.width = "100%";
	// 	nameInput.style.marginBottom = "10px";

	// 	// 服务器 ID
	// 	const idContainer = contentEl.createDiv();
	// 	idContainer.createEl("label", { text: "服务器 ID" });
	// 	const idInput = idContainer.createEl("input", {
	// 		type: "text",
	// 		value: server?.id || "",
	// 		placeholder: "输入唯一 ID",
	// 	});
	// 	idInput.style.width = "100%";
	// 	idInput.style.marginBottom = "10px";

	// 	// 脚本路径
	// 	const scriptPathContainer = contentEl.createDiv();
	// 	scriptPathContainer.createEl("label", { text: "脚本路径" });
	// 	const scriptPathInput = scriptPathContainer.createEl("input", {
	// 		type: "text",
	// 		value: server?.scriptPath || "",
	// 		placeholder: "输入脚本路径",
	// 	});
	// 	scriptPathInput.style.width = "100%";
	// 	scriptPathInput.style.marginBottom = "10px";

	// 	// 启动命令
	// 	const startCommandContainer = contentEl.createDiv();
	// 	startCommandContainer.createEl("label", { text: "启动命令 (可选)" });
	// 	const startCommandInput = startCommandContainer.createEl("input", {
	// 		type: "text",
	// 		value: server?.startCommand || "",
	// 		placeholder: "输入启动命令",
	// 	});
	// 	startCommandInput.style.width = "100%";
	// 	startCommandInput.style.marginBottom = "10px";

	// 	// 描述
	// 	const descContainer = contentEl.createDiv();
	// 	descContainer.createEl("label", { text: "描述 (可选)" });
	// 	const descInput = descContainer.createEl("textarea", {});
	// 	descInput.value = server?.description || "";
	// 	descInput.placeholder = "输入服务器描述";
	// 	descInput.style.width = "100%";
	// 	descInput.style.height = "80px";
	// 	descInput.style.marginBottom = "20px";

	// 	// 按钮
	// 	const buttonContainer = contentEl.createDiv({
	// 		cls: "modal-button-container",
	// 	});

	// 	const cancelButton = buttonContainer.createEl("button", {
	// 		text: "取消",
	// 	});
	// 	cancelButton.addEventListener("click", () => modal.close());

	// 	const submitButton = buttonContainer.createEl("button", {
	// 		cls: "mod-cta",
	// 		text: server ? "更新" : "添加",
	// 	});
	// 	submitButton.addEventListener("click", async () => {
	// 		const name = nameInput.value.trim();
	// 		const id = idInput.value.trim();
	// 		const scriptPath = scriptPathInput.value.trim();

	// 		if (!name || !id || !scriptPath) {
	// 			new Notice("服务器名称、ID 和脚本路径不能为空");
	// 			return;
	// 		}

	// 		// 检查 ID 是否重复（除了当前编辑的服务器）
	// 		const isDuplicate = server
	// 			? this.plugin.settings.mcpServerRegistry.some(
	// 					(s) => s.id === id && s.id !== server.id,
	// 				)
	// 			: this.plugin.settings.mcpServerRegistry.some(
	// 					(s) => s.id === id,
	// 				);

	// 		if (isDuplicate) {
	// 			new Notice(`ID "${id}" 已存在，请使用不同的 ID`);
	// 			return;
	// 		}

	// 		const serverConfig: McpServerConfig = {
	// 			id,
	// 			name,
	// 			scriptPath,
	// 			startCommand: startCommandInput.value.trim() || undefined,
	// 			description: descInput.value.trim() || undefined,
	// 		};

	// 		if (server) {
	// 			// 更新现有服务器
	// 			await this.plugin.profileManager.updateMcpServer(
	// 				server.id,
	// 				serverConfig,
	// 			);
	// 		} else {
	// 			// 添加新服务器
	// 			await this.plugin.profileManager.addMcpServer(serverConfig);
	// 		}

	// 		// 刷新显示
	// 		this.display();
	// 		modal.close();
	// 	});

	// 	// 显示模态窗口
	// 	modal.open();
	// }

	// 处理服务器表单提交
	private async handleServerFormSubmit() {
		const { id, name, scriptPath, startCommand, description, args } =
			this.serverFormData;

		// 验证必填字段
		if (!name || !id || !scriptPath) {
			new Notice("服务器名称、ID 和脚本路径不能为空");
			return;
		}

		// 检查 ID 是否重复
		const isDuplicate = this.editingServer
			? this.plugin.settings.mcpServerRegistry.some(
					(s) => s.id === id && s.id !== this.editingServer?.id,
				)
			: this.plugin.settings.mcpServerRegistry.some((s) => s.id === id);

		if (isDuplicate) {
			new Notice(`ID "${id}" 已存在，请使用不同的 ID`);
			return;
		}

		const serverConfig: McpServerConfig = {
			id,
			name,
			scriptPath,
			startCommand: startCommand.trim() || undefined,
			description: description.trim() || undefined,
			args: args.length > 0 ? args : undefined,
		};

		if (this.editingServer) {
			// 更新现有服务器
			await this.plugin.profileManager.updateMcpServer(
				this.editingServer.id,
				serverConfig,
			);
		} else {
			// 添加新服务器
			await this.plugin.profileManager.addMcpServer(serverConfig);
		}

		// 重置表单状态
		this.showAddServerForm = false;
		this.editingServer = undefined;

		// 刷新显示
		this.display();
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

		// MCP 服务器选择
		containerEl.createEl("h3", { text: "MCP 服务器" });
		containerEl.createEl("p", {
			text: "选择在此 Profile 中启用的 MCP 服务器",
		});

		const { mcpServerRegistry } = this.plugin.settings;

		if (mcpServerRegistry.length === 0) {
			containerEl.createEl("p", {
				text: "全局注册表中没有可用的 MCP 服务器。请先在全局设置中添加服务器。",
				cls: "copilot-empty-message",
			});
		} else {
			const serverContainer = containerEl.createDiv();

			mcpServerRegistry.forEach((server) => {
				const isEnabled = activeProfile.enabledMcpServers.includes(
					server.id,
				);

				new Setting(serverContainer)
					.setName(server.name)
					.setDesc(server.description || `ID: ${server.id}`)
					.addToggle((toggle) => {
						toggle.setValue(isEnabled).onChange(async (value) => {
							await this.plugin.profileManager.toggleMcpServerForActiveProfile(
								server.id,
								value,
							);
						});
					});
			});
		}
	}
}

export default CopilotPluginSettingTab;

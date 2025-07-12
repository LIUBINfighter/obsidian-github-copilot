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

// 创建MCP服务器设置模态窗口
class McpServerModal extends Modal {
	plugin: CopilotPlugin;
	editingServer?: McpServerConfig;
	onSubmit: (serverConfig: McpServerConfig) => void;

	// 用于存储服务器表单的临时数据
	serverFormData: {
		id: string;
		name: string;
		type: "stdio" | "sse";
		scriptPath: string;
		command: string;
		url: string;
		version: string;
		description: string;
		args: string[];
		env: Record<string, string>;
		cwd: string;
		oauth: string;
	} = {
		id: "",
		name: "",
		type: "stdio",
		scriptPath: "",
		command: "",
		url: "",
		version: "",
		description: "",
		args: [],
		env: {},
		cwd: "",
		oauth: "",
	};

	constructor(
		app: App,
		plugin: CopilotPlugin,
		onSubmit: (serverConfig: McpServerConfig) => void,
		editingServer?: McpServerConfig,
	) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
		this.editingServer = editingServer;

		// 如果是编辑模式，填充表单数据
		if (editingServer) {
			// 将服务器数据填充到表单
			if (editingServer.type === "stdio") {
				this.serverFormData = {
					id: editingServer.id,
					name: editingServer.name,
					type: "stdio",
					scriptPath: editingServer.scriptPath || "",
					command: editingServer.command || "",
					url: "",
					version: editingServer.version || "",
					description: editingServer.description || "",
					args: editingServer.args || [],
					env: editingServer.env || {},
					cwd: editingServer.cwd || "",
					oauth: "",
				};
			} else if (editingServer.type === "sse") {
				this.serverFormData = {
					id: editingServer.id,
					name: editingServer.name,
					type: "sse",
					scriptPath: "",
					command: "",
					url: editingServer.url || "",
					version: editingServer.version || "",
					description: editingServer.description || "",
					args: [],
					env: editingServer.env || {},
					cwd: "",
					oauth: editingServer.oauth || "",
				};
			}
		}
	}

	onOpen() {
		const { contentEl } = this;

		// 设置模态窗口标题
		contentEl.createEl("h2", {
			text: this.editingServer ? "编辑 MCP 服务器" : "添加 MCP 服务器",
		});

		// 创建表单容器
		const formContainer = contentEl.createDiv({
			cls: "copilot-server-form",
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

		// 服务器类型选择
		const typeContainer = formContainer.createDiv();
		typeContainer.createEl("label", { text: "服务器类型" });
		const typeSelect = typeContainer.createEl("select");
		const stdioOption = typeSelect.createEl("option", {
			text: "STDIO - 本地进程",
			value: "stdio",
		});
		const sseOption = typeSelect.createEl("option", {
			text: "SSE - HTTP服务",
			value: "sse",
		});

		// 设置选中值
		if (this.serverFormData.type === "stdio") {
			stdioOption.selected = true;
		} else {
			sseOption.selected = true;
		}

		typeSelect.style.width = "100%";
		typeSelect.style.marginBottom = "20px";
		typeSelect.addEventListener("change", () => {
			this.serverFormData.type = typeSelect.value as "stdio" | "sse";
			// 关闭并重新打开模态窗口以重新渲染表单
			this.close();
			const newModal = new McpServerModal(
				this.app,
				this.plugin,
				this.onSubmit,
				this.editingServer,
			);
			newModal.serverFormData = this.serverFormData;
			newModal.open();
		});

		// 根据服务器类型显示不同的字段
		if (this.serverFormData.type === "stdio") {
			// STDIO类型特有字段
			// 命令
			const commandContainer = formContainer.createDiv();
			commandContainer.createEl("label", { text: "命令" });
			const commandInput = commandContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.command,
				placeholder: "输入命令，如 npx, node 等",
			});
			commandInput.style.width = "100%";
			commandInput.style.marginBottom = "10px";
			commandInput.addEventListener("input", (e) => {
				this.serverFormData.command = (
					e.target as HTMLInputElement
				).value;
			});

			// 脚本路径
			const scriptPathContainer = formContainer.createDiv();
			scriptPathContainer.createEl("label", { text: "脚本路径 (可选)" });
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

			// 工作目录
			const cwdContainer = formContainer.createDiv();
			cwdContainer.createEl("label", { text: "工作目录 (可选)" });
			const cwdInput = cwdContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.cwd,
				placeholder: "输入工作目录路径",
			});
			cwdInput.style.width = "100%";
			cwdInput.style.marginBottom = "10px";
			cwdInput.addEventListener("input", (e) => {
				this.serverFormData.cwd = (e.target as HTMLInputElement).value;
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
					.map((line) => line.trim())
					.filter((line) => line.length > 0);
			});
		} else {
			// SSE类型特有字段
			// URL
			const urlContainer = formContainer.createDiv();
			urlContainer.createEl("label", { text: "服务 URL" });
			const urlInput = urlContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.url,
				placeholder: "输入服务 URL，如 https://example.com/sse",
			});
			urlInput.style.width = "100%";
			urlInput.style.marginBottom = "10px";
			urlInput.addEventListener("input", (e) => {
				this.serverFormData.url = (e.target as HTMLInputElement).value;
			});

			// OAuth
			const oauthContainer = formContainer.createDiv();
			oauthContainer.createEl("label", { text: "OAuth (可选)" });
			const oauthInput = oauthContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.oauth,
				placeholder: "输入 OAuth 信息",
			});
			oauthInput.style.width = "100%";
			oauthInput.style.marginBottom = "10px";
			oauthInput.addEventListener("input", (e) => {
				this.serverFormData.oauth = (
					e.target as HTMLInputElement
				).value;
			});
		}

		// 版本
		const versionContainer = formContainer.createDiv();
		versionContainer.createEl("label", { text: "版本 (可选)" });
		const versionInput = versionContainer.createEl("input", {
			type: "text",
			value: this.serverFormData.version,
			placeholder: "输入版本号",
		});
		versionInput.style.width = "100%";
		versionInput.style.marginBottom = "10px";
		versionInput.addEventListener("input", (e) => {
			this.serverFormData.version = (e.target as HTMLInputElement).value;
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

		// 按钮
		const buttonContainer = formContainer.createDiv({
			cls: "modal-button-container",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "取消",
		});
		cancelButton.addEventListener("click", () => this.close());

		const submitButton = buttonContainer.createEl("button", {
			cls: "mod-cta",
			text: this.editingServer ? "更新" : "添加",
		});
		submitButton.addEventListener("click", () => this.handleSubmit());
	}

	handleSubmit() {
		const {
			id,
			name,
			type,
			scriptPath,
			command,
			url,
			version,
			description,
			args,
			env,
			cwd,
			oauth,
		} = this.serverFormData;

		// 验证必填字段
		if (!name || !id) {
			new Notice("服务器名称和ID不能为空");
			return;
		}

		// 根据类型验证必填字段
		if (type === "stdio" && !command) {
			new Notice("命令不能为空");
			return;
		}

		if (type === "sse" && !url) {
			new Notice("服务 URL 不能为空");
			return;
		}

		// 检查 ID 是否重复（仅在添加新服务器时检查）
		if (!this.editingServer) {
			const isDuplicate = this.plugin.settings.mcpServerRegistry.some(
				(s) => s.id === id,
			);
			if (isDuplicate) {
				new Notice(`ID "${id}" 已存在，请使用不同的 ID`);
				return;
			}
		}

		// 根据服务器类型创建配置对象
		let serverConfig: McpServerConfig;

		if (type === "stdio") {
			serverConfig = {
				id,
				name,
				type: "stdio",
				command,
				version: version || undefined,
				scriptPath: scriptPath || undefined,
				args: args.length > 0 ? args : undefined,
				cwd: cwd || undefined,
				env: Object.keys(env).length > 0 ? env : undefined,
				description: description || undefined,
			};
		} else {
			serverConfig = {
				id,
				name,
				type: "sse",
				url,
				version: version || undefined,
				oauth: oauth || undefined,
				env: Object.keys(env).length > 0 ? env : undefined,
				description: description || undefined,
			};
		}

		// 调用传入的回调函数
		this.onSubmit(serverConfig);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class CopilotPluginSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;
	editingServer?: McpServerConfig;
	activeTab: "global" | "profile" = "global";
	showAddServerForm: boolean = false;
	serverFormData: {
		id: string;
		name: string;
		type: "stdio" | "sse";
		scriptPath: string;
		command: string;
		url: string;
		version: string;
		description: string;
		args: string[];
		env: Record<string, string>;
		cwd: string;
		oauth: string;
	} = {
		id: "",
		name: "",
		type: "stdio",
		scriptPath: "",
		command: "",
		url: "",
		version: "",
		description: "",
		args: [],
		env: {},
		cwd: "",
		oauth: "",
	};

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

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

				// 创建服务器标题区域
				const headerDiv = serverItem.createDiv({
					cls: "copilot-server-header",
				});

				const setting = new Setting(headerDiv)
					.setName(server.name)
					.setDesc(server.description || `ID: ${server.id}`);

				// 显示类型信息
				const typeEl = serverItem.createDiv({
					cls: "copilot-server-type",
				});

				// 根据服务器类型显示不同的信息
				if ("type" in server) {
					if (server.type === "stdio") {
						typeEl.createEl("span", {
							text: `类型: STDIO | 命令: ${server.command}`,
							cls: "copilot-server-type-text",
						});

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
					} else if (server.type === "sse") {
						typeEl.createEl("span", {
							text: `类型: SSE | URL: ${server.url}`,
							cls: "copilot-server-type-text",
						});
					}
				} else {
					// 兼容旧版本数据
					typeEl.createEl("span", {
						text: "类型: 未指定",
						cls: "copilot-server-type-text",
					});
				}

				setting
					.addButton((button) => {
						button.setButtonText("编辑").onClick(() => {
							// 打开编辑服务器模态窗口
							new McpServerModal(
								this.app,
								this.plugin,
								async (serverConfig) => {
									// 更新现有服务器
									await this.plugin.profileManager.updateMcpServer(
										server.id,
										serverConfig,
									);
									this.display();
								},
								server,
							).open();
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
					// 打开添加服务器的模态窗口
					new McpServerModal(
						this.app,
						this.plugin,
						async (serverConfig) => {
							// 添加新服务器
							await this.plugin.profileManager.addMcpServer(
								serverConfig,
							);
							this.display();
						},
					).open();
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

			// 服务器类型选择
			const typeContainer = formContainer.createDiv();
			typeContainer.createEl("label", { text: "服务器类型" });
			const typeSelect = typeContainer.createEl("select");
			const stdioOption = typeSelect.createEl("option", {
				text: "STDIO - 本地进程",
				value: "stdio",
			});
			const sseOption = typeSelect.createEl("option", {
				text: "SSE - HTTP服务",
				value: "sse",
			});

			// 设置选中值
			if (this.serverFormData.type === "stdio") {
				stdioOption.selected = true;
			} else {
				sseOption.selected = true;
			}

			typeSelect.style.width = "100%";
			typeSelect.style.marginBottom = "20px";
			typeSelect.addEventListener("change", () => {
				this.serverFormData.type = typeSelect.value as "stdio" | "sse";
				this.display(); // 重新渲染表单以显示/隐藏相关字段
			});

			// 根据服务器类型显示不同的字段
			if (this.serverFormData.type === "stdio") {
				// STDIO类型特有字段
				// 命令
				const commandContainer = formContainer.createDiv();
				commandContainer.createEl("label", { text: "命令" });
				const commandInput = commandContainer.createEl("input", {
					type: "text",
					value: this.serverFormData.command,
					placeholder: "输入命令，如 npx, node 等",
				});
				commandInput.style.width = "100%";
				commandInput.style.marginBottom = "10px";
				commandInput.addEventListener("input", (e) => {
					this.serverFormData.command = (
						e.target as HTMLInputElement
					).value;
				});

				// 脚本路径
				const scriptPathContainer = formContainer.createDiv();
				scriptPathContainer.createEl("label", {
					text: "脚本路径 (可选)",
				});
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

				// 工作目录
				const cwdContainer = formContainer.createDiv();
				cwdContainer.createEl("label", { text: "工作目录 (可选)" });
				const cwdInput = cwdContainer.createEl("input", {
					type: "text",
					value: this.serverFormData.cwd,
					placeholder: "输入工作目录路径",
				});
				cwdInput.style.width = "100%";
				cwdInput.style.marginBottom = "10px";
				cwdInput.addEventListener("input", (e) => {
					this.serverFormData.cwd = (
						e.target as HTMLInputElement
					).value;
				});

				// 参数列表
				const argsContainer = formContainer.createDiv();
				argsContainer.createEl("label", {
					text: "命令参数 (每行一个)",
				});
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
						.map((line) => line.trim())
						.filter((line) => line.length > 0);
				});
			} else {
				// SSE类型特有字段
				// URL
				const urlContainer = formContainer.createDiv();
				urlContainer.createEl("label", { text: "服务 URL" });
				const urlInput = urlContainer.createEl("input", {
					type: "text",
					value: this.serverFormData.url,
					placeholder: "输入服务 URL，如 https://example.com/sse",
				});
				urlInput.style.width = "100%";
				urlInput.style.marginBottom = "10px";
				urlInput.addEventListener("input", (e) => {
					this.serverFormData.url = (
						e.target as HTMLInputElement
					).value;
				});

				// OAuth
				const oauthContainer = formContainer.createDiv();
				oauthContainer.createEl("label", { text: "OAuth (可选)" });
				const oauthInput = oauthContainer.createEl("input", {
					type: "text",
					value: this.serverFormData.oauth,
					placeholder: "输入 OAuth 信息",
				});
				oauthInput.style.width = "100%";
				oauthInput.style.marginBottom = "10px";
				oauthInput.addEventListener("input", (e) => {
					this.serverFormData.oauth = (
						e.target as HTMLInputElement
					).value;
				});
			}

			// 版本
			const versionContainer = formContainer.createDiv();
			versionContainer.createEl("label", { text: "版本 (可选)" });
			const versionInput = versionContainer.createEl("input", {
				type: "text",
				value: this.serverFormData.version,
				placeholder: "输入版本号",
			});
			versionInput.style.width = "100%";
			versionInput.style.marginBottom = "10px";
			versionInput.addEventListener("input", (e) => {
				this.serverFormData.version = (
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

					// 根据预设服务器类型创建对应的配置
					let serverConfig: McpServerConfig;

					if (selected.type === "stdio") {
						serverConfig = {
							id: selected.id,
							name: selected.name,
							type: "stdio",
							command: selected.command || "",
							args: selected.args,
							description: selected.description,
						};
					} else if (selected.url) {
						serverConfig = {
							id: selected.id,
							name: selected.name,
							type: "sse",
							url: selected.url,
							description: selected.description,
						};
					} else {
						new Notice("预设服务器缺少必要的URL信息");
						return;
					}

					await this.plugin.profileManager.addMcpServer(serverConfig);
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
		const {
			id,
			name,
			type,
			scriptPath,
			command,
			url,
			version,
			description,
			args,
			env,
			cwd,
			oauth,
		} = this.serverFormData;

		// 验证必填字段
		if (!name || !id) {
			new Notice("服务器名称和ID不能为空");
			return;
		}

		// 根据类型验证必填字段
		if (type === "stdio" && !command) {
			new Notice("命令不能为空");
			return;
		}

		if (type === "sse" && !url) {
			new Notice("服务 URL 不能为空");
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

		// 根据服务器类型创建配置对象
		let serverConfig: McpServerConfig;

		if (type === "stdio") {
			serverConfig = {
				id,
				name,
				type: "stdio",
				command,
				version: version || undefined,
				scriptPath: scriptPath || undefined,
				args: args.length > 0 ? args : undefined,
				cwd: cwd || undefined,
				env: Object.keys(env).length > 0 ? env : undefined,
				description: description || undefined,
			};
		} else {
			serverConfig = {
				id,
				name,
				type: "sse",
				url,
				version: version || undefined,
				oauth: oauth || undefined,
				env: Object.keys(env).length > 0 ? env : undefined,
				description: description || undefined,
			};
		}

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

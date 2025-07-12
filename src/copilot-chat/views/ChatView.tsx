import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { CHAT_VIEW_TYPE } from "../types/constants";
import CopilotPlugin from "../../main";
import Chat from "../components/Chat";
import { addIcon } from "obsidian";
import { copilotIcon } from "../../assets/copilot";
import { useCopilotStore } from "../store/store";

export const PluginContext = React.createContext<CopilotPlugin | undefined>(
	undefined,
);

export default class ChatView extends ItemView {
	private root: Root | null = null;
	public plugin: CopilotPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin) {
		super(leaf);
		this.app = plugin.app;
		this.plugin = plugin;
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getIcon(): string {
		// 注册 copilot 图标并返回图标名，Obsidian 会自动渲染 SVG
		addIcon("copilot", copilotIcon);
		return "copilot";
	}

	getTitle(): string {
		return "Copilot Chat";
	}

	getDisplayText(): string {
		return "Copilot Chat";
	}

	async onOpen(): Promise<void> {
		if (!this.root) {
			this.root = createRoot(this.containerEl.children[1]);
		}

		this.root.render(
			<PluginContext.Provider value={this.plugin}>
				<React.StrictMode>
					<Chat />
				</React.StrictMode>
			</PluginContext.Provider>,
		);
	}

	async onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	updateView(): void {
		this.onOpen();
	}

	// 配置文件切换后同步聊天设置
	public updateForProfileSwitch(): void {
		// 只调用 zustand store 的 applyProfileSettings，不需要重新渲染整个视图
		useCopilotStore.getState().applyProfileSettings(this.plugin);
	}
}

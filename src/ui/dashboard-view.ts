import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type { TrackerSettings } from "../types";
import { renderVideoCard } from "./video-card";
import { getEmptyDashboardCopy } from "./copy";

export const VIEW_TYPE_TRACKER = "youtube-tracker-dashboard";

export interface DashboardCallbacks {
	onAdd: () => void;
	onRemove: (channelId: string) => void;
	onRefresh: () => void;
}

export class TrackerDashboardView extends ItemView {
	private settings: TrackerSettings;
	private cb: DashboardCallbacks;
	private refreshing = false;

	constructor(leaf: WorkspaceLeaf, settings: TrackerSettings, cb: DashboardCallbacks) {
		super(leaf);
		this.settings = settings;
		this.cb = cb;
	}

	getViewType(): string {
		return VIEW_TYPE_TRACKER;
	}

	getDisplayText(): string {
		return "YouTube Tracker";
	}

	getIcon(): string {
		return "rss";
	}

	updateSettings(settings: TrackerSettings, refreshing?: boolean): void {
		this.settings = settings;
		if (typeof refreshing === "boolean") this.refreshing = refreshing;
		if (this.leaf.view === this) {
			void this.render();
		}
	}

	setRefreshing(value: boolean): void {
		this.refreshing = value;
		if (this.leaf.view === this) {
			void this.render();
		}
	}

	updateCallbacks(cb: DashboardCallbacks): void {
		this.cb = cb;
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		// Nothing to clean up.
	}

	private formatLastUpdate(): string {
		if (this.settings.lastSuccessfulRefreshAt) {
			return `Updated: ${new Date(this.settings.lastSuccessfulRefreshAt).toLocaleString("en-US")}`;
		}
		if (this.settings.lastGlobalRefreshAt) {
			return `Last attempt: ${new Date(this.settings.lastGlobalRefreshAt).toLocaleString("en-US")}`;
		}
		return "Not updated yet.";
	}

	private async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("youtube-tracker-dashboard");

		const header = container.createDiv({ cls: "yt-header" });
		const titleBlock = header.createDiv({ cls: "yt-title-block" });
		titleBlock.createEl("h3", { text: "YouTube Tracker", cls: "yt-title" });
		const count = this.settings.channels.length;
		titleBlock.createDiv({
			text: count === 0 ? "Track the latest videos from your channels" : `${count} ${count === 1 ? "channel" : "channels"} · ${this.formatLastUpdate()}`,
			cls: "yt-subtitle",
		});

		const actions = container.createDiv({ cls: "youtube-tracker-actions" });
		const addBtn = actions.createEl("button", { text: "+ Add channel", cls: "mod-cta" });
		const refreshBtn = actions.createEl("button", {
			text: this.refreshing ? "Refreshing…" : "Refresh",
		});
		refreshBtn.disabled = this.refreshing;

		addBtn.addEventListener("click", () => this.cb.onAdd());
		refreshBtn.addEventListener("click", () => {
			if (this.refreshing) return;
			if (this.settings.channels.length === 0) {
				new Notice("Add a channel first.");
				return;
			}
			this.cb.onRefresh();
		});

		if (this.refreshing) {
			container.createDiv({ cls: "youtube-tracker-loading", text: "Consultando feeds de a uno para no saturar a YouTube…" });
		}

		const list = container.createDiv({ cls: "youtube-tracker-list" });
		if (this.settings.channels.length === 0) {
			const empty = list.createDiv({ cls: "youtube-tracker-empty" });
			const copy = getEmptyDashboardCopy();
			empty.createEl("h4", { text: copy.title, cls: "yt-empty-title" });
			empty.createEl("p", { text: copy.description, cls: "yt-empty-sub" });
			empty.createEl("p", {
				text: "Paste a channel URL, such as youtube.com/@name or youtube.com/channel/ID.",
				cls: "yt-empty-sub",
			});
			return;
		}

		for (const channel of this.settings.channels) {
			const wrapper = list.createDiv({ cls: "youtube-tracker-channel-wrap" });
			renderVideoCard(wrapper, channel);
			const footer = wrapper.createDiv({ cls: "yt-card-footer" });
			const del = footer.createEl("button", { text: "Delete", cls: "yt-btn-ghost" });
			del.setAttr("aria-label", `Delete ${channel.name || channel.channelId}`);
			del.addEventListener("click", () => this.cb.onRemove(channel.channelId));
		}
	}
}

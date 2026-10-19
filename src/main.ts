import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import type { TrackerSettings } from "./types";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";
import { TrackerDashboardView, VIEW_TYPE_TRACKER } from "./ui/dashboard-view";
import { ChannelFormModal } from "./ui/channel-form";
import { resolveChannelFromUrl } from "./services/channel-resolver";
import { fetchChannelEntries, fetchViaHtmlFallback, isRecoverableRefreshError, NoEligibleVideosError, sleep, statusFromError, toUserError } from "./services/youtube-rss";
import { selectLatestNonShort } from "./services/video-selector";
import type { RawFeedEntry } from "./services/video-selector";

const INTER_CHANNEL_DELAY_MS = 700;
const MIN_REFRESH_INTERVAL_MS = 30_000;
const MAX_FETCH_ATTEMPTS = 3;

export default class YoutubeTrackerPlugin extends Plugin {
	settings: TrackerSettings = { ...DEFAULT_SETTINGS };
	private isRefreshing = false;

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());

		this.registerView(
			VIEW_TYPE_TRACKER,
			(leaf) =>
				new TrackerDashboardView(leaf, this.settings, {
					onAdd: () => this.openAddModal(),
					onRemove: (id) => void this.removeChannel(id),
					onRefresh: () => void this.refreshAll(),
				}),
		);

		this.addCommand({
			id: "open-dashboard",
			name: "Open dashboard",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "refresh-videos",
			name: "Refresh videos",
			callback: () => {
				void this.refreshAll();
			},
		});

		this.addRibbonIcon("rss", "Open YouTube Tracker", () => {
			void this.activateView();
		});
	}

	onunload(): void {
		// Obsidian unregisters the view automatically.
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshOpenViews();
	}

	private openAddModal(): void {
		const modal = new ChannelFormModal(this.app, async (url) => {
			await this.addChannel(url);
		});
		modal.open();
	}

	async addChannel(url: string): Promise<void> {
		const resolved = await resolveChannelFromUrl(url);
		const exists = this.settings.channels.some((c) => c.channelId === resolved.channelId);
		if (exists) {
			throw new Error("This channel is already on the list.");
		}
		this.settings.channels.push({
			channelId: resolved.channelId,
			name: resolved.name,
			channelUrl: resolved.channelUrl,
		});
		await this.saveSettings();
		new Notice(`Channel added: ${resolved.name}`);
	}

	async removeChannel(channelId: string): Promise<void> {
		const before = this.settings.channels.length;
		this.settings.channels = this.settings.channels.filter((c) => c.channelId !== channelId);
		if (this.settings.channels.length === before) return;
		await this.saveSettings();
		new Notice("Channel removed.");
	}

	async refreshAll(): Promise<void> {
		if (this.isRefreshing) {
			new Notice("A refresh is already in progress.");
			return;
		}
		if (this.settings.channels.length === 0) {
			new Notice("Add a channel first.");
			return;
		}
		const sinceLast = this.settings.lastGlobalRefreshAt ? Date.now() - this.settings.lastGlobalRefreshAt : Number.POSITIVE_INFINITY;
		if (sinceLast < MIN_REFRESH_INTERVAL_MS) {
			const waitSec = Math.ceil((MIN_REFRESH_INTERVAL_MS - sinceLast) / 1000);
			new Notice(`Wait ${waitSec}s before refreshing to avoid YouTube rate limits.`);
			return;
		}
		this.isRefreshing = true;
		this.setRefreshingViews(true);

		let ok = 0;
		let failed = 0;
		let rateLimited = 0;
		for (let i = 0; i < this.settings.channels.length; i++) {
			const channel = this.settings.channels[i];
			try {
				let entries: RawFeedEntry[];
				try {
					entries = await fetchChannelEntries(channel.channelId, undefined, MAX_FETCH_ATTEMPTS);
				} catch (rssError) {
					if (statusFromError(rssError) === 404) {
						entries = await fetchViaHtmlFallback(channel.channelId, channel.name || channel.channelId);
					} else {
						throw rssError;
					}
				}
				const sel = selectLatestNonShort(entries);
				if (sel.kind === "video") {
					channel.lastVideo = sel.entry;
					channel.lastFetchedAt = Date.now();
					channel.lastResult = "video";
					channel.lastError = undefined;
					channel.lastErrorKind = undefined;
					if ((!channel.name || channel.name === channel.channelId) && sel.entry.channelName) {
						channel.name = sel.entry.channelName;
					}
					ok++;
				} else if (sel.kind === "all-shorts") {
					channel.lastFetchedAt = Date.now();
					channel.lastResult = "no-eligible-videos";
					channel.lastError = undefined;
					channel.lastErrorKind = undefined;
					ok++;
				} else {
					channel.lastVideo = undefined;
					channel.lastFetchedAt = Date.now();
					channel.lastResult = "empty";
					channel.lastError = undefined;
					channel.lastErrorKind = undefined;
					ok++;
				}
			} catch (e) {
				if (e instanceof NoEligibleVideosError) {
					channel.lastFetchedAt = Date.now();
					channel.lastResult = "no-eligible-videos";
					channel.lastError = undefined;
					channel.lastErrorKind = undefined;
					ok++;
				} else {
					const friendlyError = toUserError(e);
					channel.lastError = friendlyError.message;
					channel.lastErrorKind = isRecoverableRefreshError(friendlyError) ? "recoverable" : "permanent";
					if (statusFromError(e) === 429) rateLimited++;
					failed++;
				}
			} finally {
				channel.lastAttemptAt = Date.now();
			}
			if (i < this.settings.channels.length - 1) {
				await sleep(INTER_CHANNEL_DELAY_MS);
			}
		}

		this.settings.lastGlobalRefreshAt = Date.now();
		if (ok > 0) {
			this.settings.lastSuccessfulRefreshAt = Date.now();
		}
		this.isRefreshing = false;
		await this.saveSettings();
		this.setRefreshingViews(false);
		if (failed === 0) {
			new Notice(`Updated ${ok} ${ok === 1 ? "channel" : "channels"}.`);
		} else if (rateLimited > 0) {
			new Notice(`YouTube is limiting ${rateLimited} requests. Wait a few minutes, then choose Refresh to try again.`);
		} else {
			new Notice(`Done: ${ok} succeeded, ${failed} need attention.`);
		}
	}

	private refreshOpenViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TRACKER)) {
			if (leaf.view instanceof TrackerDashboardView) {
				leaf.view.updateCallbacks({
					onAdd: () => this.openAddModal(),
					onRemove: (id) => void this.removeChannel(id),
					onRefresh: () => void this.refreshAll(),
				});
				leaf.view.updateSettings(this.settings, this.isRefreshing);
			}
		}
	}

	private setRefreshingViews(value: boolean): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TRACKER)) {
			if (leaf.view instanceof TrackerDashboardView) {
				leaf.view.setRefreshing(value);
			}
		}
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TRACKER);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) {
				new Notice("Could not open the dashboard.");
				return;
			}
			await leaf.setViewState({ type: VIEW_TYPE_TRACKER, active: true });
		}

		void workspace.revealLeaf(leaf);
	}
}

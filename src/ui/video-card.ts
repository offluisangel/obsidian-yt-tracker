import type { TrackedChannel } from "../types";
import { formatAge, formatDateTime } from "../utils/date-utils";
import { getChannelEmptyCopy } from "./copy";

function statusOf(channel: TrackedChannel): "ok" | "stale" | "recoverable" | "permanent" | "empty" | "no-eligible-videos" {
	if (channel.lastError) {
		if (channel.lastVideo) return "stale";
		return channel.lastErrorKind === "permanent" ? "permanent" : "recoverable";
	}
	if (channel.lastResult === "no-eligible-videos") return "no-eligible-videos";
	if (channel.lastVideo) return "ok";
	return "empty";
}

const STATUS_LABEL: Record<string, string> = {
	ok: "Up to date",
	stale: "Showing previous data",
	recoverable: "Retry available",
	permanent: "Check channel",
	empty: "No data",
	"no-eligible-videos": "No long-form videos",
};

export function renderVideoCard(parent: HTMLElement, channel: TrackedChannel): void {
	const card = parent.createDiv({ cls: "youtube-tracker-card" });
	const status = statusOf(channel);

	const head = card.createDiv({ cls: "youtube-tracker-card-head" });
	const dot = head.createSpan({ cls: `yt-dot yt-dot-${status}` });
	dot.setAttr("aria-hidden", "true");
	const nameWrap = head.createDiv({ cls: "yt-channel-id" });
	nameWrap.createEl("strong", { text: channel.name || channel.channelId, cls: "yt-channel-name" });
	nameWrap.createEl("span", { text: STATUS_LABEL[status], cls: `yt-badge yt-badge-${status}` });
	const ageText = channel.lastFetchedAt
		? `Data retrieved ${formatAge(channel.lastFetchedAt)}`
		: channel.lastAttemptAt
			? `No valid data · last attempt ${formatAge(channel.lastAttemptAt)}`
			: "Not checked yet";
	nameWrap.createEl("span", { text: ageText, cls: "yt-data-age" });
	if (channel.lastError && channel.lastVideo && channel.lastAttemptAt) {
		nameWrap.createEl("span", { text: `Last attempt ${formatAge(channel.lastAttemptAt)}`, cls: "yt-data-age" });
	}

	if (channel.lastVideo) {
		const video = channel.lastVideo;
		const thumbUrl = video.thumbnail ?? `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
		const thumbWrap = card.createDiv({ cls: "yt-thumb" });
		const img = thumbWrap.createEl("img", { cls: "yt-thumb-img" });
		img.src = thumbUrl;
		img.alt = video.title;
		img.loading = "lazy";
		const body = card.createDiv({ cls: "yt-body" });
		body.createEl("div", { text: video.title, cls: "yt-video-title" });
		body.createDiv({ cls: "yt-video-meta" }).setText(`${video.channelName} · ${formatDateTime(video.publishedAt)}`);

		const actions = body.createDiv({ cls: "yt-actions" });
		const watch = actions.createEl("a", { text: "Watch on YouTube", cls: "yt-btn yt-btn-primary" });
		watch.href = video.url;
		watch.target = "_blank";
		watch.rel = "noopener";
		const openChannel = actions.createEl("a", { text: "Open channel", cls: "yt-btn" });
		openChannel.href = channel.channelUrl;
		openChannel.target = "_blank";
		openChannel.rel = "noopener";

		if (channel.lastError) {
			const warn = body.createDiv({ cls: "yt-warn" });
			warn.setText(`${channel.lastError} The last available video is still shown.`);
		} else if (channel.lastResult === "no-eligible-videos") {
			body.createDiv({ cls: "yt-empty", text: "Only Shorts were found recently; the latest long-form video remains shown." });
		}
	} else if (channel.lastError) {
		const body = card.createDiv({ cls: "yt-body" });
		body.createEl("div", { text: "Could not update this channel.", cls: "yt-error-title" });
		body.createEl("div", { text: channel.lastError, cls: "yt-error-msg" });
		const actions = body.createDiv({ cls: "yt-actions" });
		const openChannel = actions.createEl("a", { text: "Open channel", cls: "yt-btn" });
		openChannel.href = channel.channelUrl;
		openChannel.target = "_blank";
		openChannel.rel = "noopener";
	} else {
		const body = card.createDiv({ cls: "yt-body" });
		if (channel.lastError) {
			body.createEl("div", { text: channel.lastError, cls: "yt-error-msg" });
			body.createEl("div", {
				text: channel.lastErrorKind === "permanent"
					? "Check that the channel is still available and the URL is correct."
					: "Choose Refresh to try again.",
				cls: "yt-empty",
			});
		} else {
			body.createEl("div", { text: getChannelEmptyCopy(channel.lastResult), cls: "yt-empty" });
		}
	}
}

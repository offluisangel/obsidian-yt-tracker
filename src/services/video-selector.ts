import type { VideoEntry } from "../types";
import { parseDateSafe } from "../utils/date-utils";

export interface RawFeedEntry {
	videoId: string;
	title: string;
	linkHref: string;
	publishedAt?: string;
	channelId: string;
	channelName: string;
	thumbnail?: string;
}

export function classifyShort(linkHref: string): VideoEntry["shortStatus"] {
	if (/\/shorts\//i.test(linkHref)) return "short";
	return "unknown";
}

export function toVideoEntry(raw: RawFeedEntry): VideoEntry {
	const shortStatus = classifyShort(raw.linkHref);
	const isShort = shortStatus === "short";
	return {
		videoId: raw.videoId,
		title: raw.title,
		url: isShort ? raw.linkHref : `https://www.youtube.com/watch?v=${raw.videoId}`,
		publishedAt: raw.publishedAt,
		channelId: raw.channelId,
		channelName: raw.channelName,
		thumbnail: raw.thumbnail,
		shortStatus,
	};
}

export type SelectionResult =
	| { kind: "video"; entry: VideoEntry }
	| { kind: "empty" }
	| { kind: "all-shorts" };

export function selectLatestNonShort(rawEntries: RawFeedEntry[]): SelectionResult {
	if (rawEntries.length === 0) return { kind: "empty" };
	const sorted = [...rawEntries].sort((a, b) => {
		const ta = parseDateSafe(a.publishedAt) ?? -1;
		const tb = parseDateSafe(b.publishedAt) ?? -1;
		return tb - ta;
	});
	let sawShort = false;
	for (const raw of sorted) {
		if (classifyShort(raw.linkHref) === "short") {
			sawShort = true;
			continue;
		}
		return { kind: "video", entry: toVideoEntry(raw) };
	}
	return sawShort ? { kind: "all-shorts" } : { kind: "empty" };
}

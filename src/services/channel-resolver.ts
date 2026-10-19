import { requestUrl } from "obsidian";
import {
	buildChannelUrl,
	buildHandleUrl,
	parseChannelUrl,
} from "../utils/url-parser";

export interface ResolvedChannel {
	channelId: string;
	name: string;
	channelUrl: string;
}

export type HtmlFetcher = (url: string) => Promise<string>;
export type RssFetcher = (channelId: string) => Promise<string>;

export function rssUrlFor(channelId: string): string {
	return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

const defaultHtmlFetcher: HtmlFetcher = async (url: string) => {
	const res = await requestUrl({
		url,
		method: "GET",
		headers: { "User-Agent": "Mozilla/5.0 (Obsidian plugin)" },
	});
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`YouTube responded ${res.status}.`);
	}
	return res.text;
};

const defaultRssFetcher: RssFetcher = async (channelId: string) => {
	const res = await requestUrl({
		url: rssUrlFor(channelId),
		method: "GET",
		headers: { "User-Agent": "Mozilla/5.0 (Obsidian plugin)" },
	});
	if (res.status === 404) {
		throw new Error("Channel not found (404).");
	}
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`Feed responded ${res.status}.`);
	}
	return res.text;
};

function firstGroup(html: string, patterns: RegExp[]): string | undefined {
	for (const re of patterns) {
		const m = html.match(re);
		if (m?.[1]) return m[1];
	}
	return undefined;
}

export function extractChannelIdFromHtml(html: string): string | undefined {
	const id = firstGroup(html, [
		/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/(?:www\.)?youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})["']/i,
		/<meta[^>]+property=["']og:url["'][^>]+content=["']https:\/\/(?:www\.)?youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})["']/i,
		/"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
		/"browseId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
		/\/channel\/(UC[A-Za-z0-9_-]{22})/,
	]);
	return id;
}

function decodeHtmlEntities(s: string): string {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'");
}

export function extractChannelNameFromHtml(html: string): string | undefined {
	const raw = firstGroup(html, [
		/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
		/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
		/<title>([^<]+)<\/title>/i,
	]);
	if (!raw) return undefined;
	const clean = decodeHtmlEntities(raw).replace(/\s*-\s*YouTube\s*$/i, "").trim();
	return clean || undefined;
}

export function extractChannelNameFromRss(xml: string): string | undefined {
	const author = xml.match(/<author>\s*<name>([^<]+)<\/name>/i)?.[1]?.trim();
	if (author) return decodeHtmlEntities(author);
	const title = xml.match(/<feed[^>]*>[\s\S]*?<title>([^<]+)<\/title>/i)?.[1]?.trim();
	if (title) return decodeHtmlEntities(title);
	return undefined;
}

export interface ResolveDeps {
	fetchHtml?: HtmlFetcher;
	fetchRss?: RssFetcher;
}

function toUserError(e: unknown, fallback: string): Error {
	if (e instanceof Error) {
		const msg = e.message.toLowerCase();
		if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("enotfound") || msg.includes("econn")) {
			return new Error("No connection to YouTube. Check your network and try again.");
		}
		const status = msg.match(/(?:youtube|feed) responded (\d+)/)?.[1];
		if (status === "404" || msg.includes("channel not found")) {
			return new Error("Could not find or access this channel. Check the URL.");
		}
		if (status === "403" || status === "429" || (status && Number(status) >= 500)) {
			return new Error("YouTube could not verify this channel right now. Try again later.");
		}
		return e;
	}
	return new Error(fallback);
}

export async function resolveChannelFromUrl(input: string, deps: ResolveDeps = {}): Promise<ResolvedChannel> {
	const parsed = parseChannelUrl(input);
	if (parsed.kind === "invalid") {
		throw new Error(parsed.reason);
	}

	const fetchHtml = deps.fetchHtml ?? defaultHtmlFetcher;
	const fetchRss = deps.fetchRss ?? defaultRssFetcher;

	if (parsed.kind === "channelId") {
		const channelId = parsed.channelId;
		const channelUrl = buildChannelUrl(channelId);
		try {
			const xml = await fetchRss(channelId);
			const name = extractChannelNameFromRss(xml) ?? channelId;
			return { channelId, name, channelUrl };
		} catch (e) {
			// Fallback: validate through the channel's HTML page.
			try {
				const html = await fetchHtml(channelUrl);
				const found = extractChannelIdFromHtml(html);
				if (found && found !== channelId) {
					throw new Error("The ID does not match the channel.");
				}
				const name = extractChannelNameFromHtml(html) ?? channelId;
				return { channelId, name, channelUrl };
			} catch (e2) {
				throw toUserError(e2 instanceof Error && e2.message.includes("match") ? e2 : e, "Could not verify the channel.");
			}
		}
	}

	// A handle or custom URL must be resolved to a channel ID through its public HTML page.
	const pageUrl = buildHandleUrl(parsed.handlePath);
	let html: string;
	try {
		html = await fetchHtml(pageUrl);
	} catch (e) {
		throw toUserError(e, "Could not open the channel page.");
	}
	const channelId = extractChannelIdFromHtml(html);
	if (!channelId) {
		throw new Error("Could not resolve the channel ID from that URL. Try a /channel/ID URL.");
	}
	const name = extractChannelNameFromHtml(html) ?? parsed.handlePath;
	return { channelId, name, channelUrl: buildChannelUrl(channelId) };
}

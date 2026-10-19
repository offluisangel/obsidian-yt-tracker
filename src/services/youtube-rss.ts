import { requestUrl } from "obsidian";
import type { RawFeedEntry } from "./video-selector";

export type RssXmlFetcher = (channelId: string) => Promise<string>;

export function rssUrlFor(channelId: string): string {
	return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isRetryableStatus(status: number): boolean {
	return status === 429 || status === 408 || status === 425 || (status >= 500 && status < 600);
}

export function statusFromError(e: unknown): number | undefined {
	if (e instanceof Error) {
		const anyErr = e as { status?: unknown };
		if (typeof anyErr.status === "number") return anyErr.status;
		const m = e.message.match(/(?:feed|youtube) responded (\d+)/i) ?? e.message.match(/(?:feed|youtube) respondió (\d+)/i);
		if (m?.[1]) return Number(m[1]);
	}
	return undefined;
}

const defaultFetcher: RssXmlFetcher = async (channelId: string) => {
	const res = await requestUrl({
		url: rssUrlFor(channelId),
		method: "GET",
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
			Accept: "application/atom+xml, application/xml, text/xml, */*",
		},
	});
	if (res.status === 404) {
		throw new Error("Feed responded 404.");
	}
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`Feed responded ${res.status}.`);
	}
	return res.text;
};

async function fetchChannelPageHtml(channelId: string): Promise<string> {
	const urls = [
		`https://www.youtube.com/channel/${channelId}/videos`,
		`https://www.youtube.com/channel/${channelId}`,
	];
	let lastError: unknown;
	for (const url of urls) {
		try {
			const res = await requestUrl({
				url,
				method: "GET",
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
					"Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
				},
			});
			if (res.status >= 200 && res.status < 300 && typeof res.text === "string" && res.text.length > 10000) {
				return res.text;
			}
			lastError = new Error(`YouTube responded ${res.status}.`);
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError instanceof Error ? lastError : new Error("Could not open the channel page.");
}

export function extractShortVideoIdsFromHtml(html: string): string[] {
	const ids: string[] = [];
	const re = /\/shorts\/([A-Za-z0-9_-]{11})/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(html)) !== null) {
		if (!ids.includes(match[1])) ids.push(match[1]);
	}
	return ids;
}

export function extractVideoIdsFromHtml(html: string, max = 10): string[] {
	const ordered: string[] = [];
	const push = (id: string) => {
		if (/^[A-Za-z0-9_-]{11}$/.test(id) && !ordered.includes(id) && ordered.length < max) {
			ordered.push(id);
		}
	};
	const re1 = /"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/g;
	let m: RegExpExecArray | null;
	while ((m = re1.exec(html)) !== null) push(m[1]);
	const re2 = /\/(?:watch\?v=|shorts\/)([A-Za-z0-9_-]{11})/g;
	while ((m = re2.exec(html)) !== null) push(m[1]);
	return ordered;
}

async function fetchTitleViaOEmbed(videoId: string): Promise<{ title?: string; author?: string }> {
	try {
		const res = await requestUrl({
			url: `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
			method: "GET",
			headers: { "User-Agent": "Mozilla/5.0 (Obsidian plugin)" },
		});
		if (res.status >= 200 && res.status < 300) {
			const data: unknown = JSON.parse(res.text);
			if (typeof data === "object" && data !== null && !Array.isArray(data)) {
				const record = data as Record<string, unknown>;
				const title = typeof record.title === "string" ? record.title : undefined;
				const author = typeof record.author_name === "string" ? record.author_name : undefined;
				return { title, author };
			}
		}
	} catch {
		return {};
	}
	return {};
}

/** Fallback for a known YouTube RSS 404: extract recent videos from the channel page. */
export async function fetchViaHtmlFallback(channelId: string, channelName: string): Promise<RawFeedEntry[]> {
	const html = await fetchChannelPageHtml(channelId);
	const shorts = new Set(extractShortVideoIdsFromHtml(html));
	const ids = extractVideoIdsFromHtml(html, 30).filter((id) => !shorts.has(id)).slice(0, 5);
	if (ids.length === 0) {
		if (shorts.size > 0) throw new NoEligibleVideosError();
		throw new Error("YouTube returned no feed and the channel page contained no visible videos.");
	}
	const firstPublishedAt = await resolveFallbackDate(ids[0], html);
	const entries: RawFeedEntry[] = [];
	for (let i = 0; i < ids.slice(0, 3).length; i++) {
		const videoId = ids[i];
		const meta = await fetchTitleViaOEmbed(videoId);
		entries.push({
			videoId,
			title: meta.title ?? "Recent video (title unavailable)",
			linkHref: `https://www.youtube.com/watch?v=${videoId}`,
			publishedAt: i === 0 ? firstPublishedAt : undefined,
			channelId,
			channelName: meta.author ?? channelName,
			thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
		});
	}
	return entries;
}

export function parseRelativeTimeToIso(text: string, now = Date.now()): string | undefined {
	const t = text.toLowerCase().trim();
	if (/^(hoy|today)/.test(t)) return new Date(now).toISOString();
	if (/^(ayer|yesterday)/.test(t)) return new Date(now - 86_400_000).toISOString();
	const m = t.match(/(\d+|una?|one|an?)\s*(segundos?|seconds?|secs?|minutos?|minutes?|mins?|horas?|hours?|hrs?|h\b|d[ií]as?|days?|d\b|semanas?|weeks?|w\b|meses?|months?|años?|anos?|years?)/);
	if (!m) return undefined;
	const n = /^\d+$/.test(m[1]) ? Number.parseInt(m[1], 10) : 1;
	const unit = m[2];
	let ms = 0;
	if (/seg|sec/.test(unit)) ms = n * 1_000;
	else if (/min/.test(unit)) ms = n * 60_000;
	else if (/hor|hour|hr|^h$/.test(unit)) ms = n * 3_600_000;
	else if (/d[ií]a|day|^d$/.test(unit)) ms = n * 86_400_000;
	else if (/seman|week|^w$/.test(unit)) ms = n * 7 * 86_400_000;
	else if (/mes|month/.test(unit)) ms = n * 30 * 86_400_000;
	else if (/año|ano|year/.test(unit)) ms = n * 365 * 86_400_000;
	else return undefined;
	return new Date(now - ms).toISOString();
}

export function extractPublishedAtFromWatchHtml(html: string): string | undefined {
	const meta =
		html.match(/<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i) ??
		html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']datePublished["']/i);
	if (meta?.[1]) {
		const t = Date.parse(meta[1].trim());
		if (!Number.isNaN(t)) return new Date(t).toISOString();
	}
	const jsonDate = html.match(/"(?:uploadDate|publishDate)"\s*:\s*"([^"]+)"/);
	if (jsonDate?.[1]) {
		const t = Date.parse(jsonDate[1].trim());
		if (!Number.isNaN(t)) return new Date(t).toISOString();
	}
	const rel = html.match(/"publishedTimeText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/);
	if (rel?.[1]) return parseRelativeTimeToIso(rel[1]);
	return undefined;
}

async function resolveFallbackDate(videoId: string, channelHtml: string): Promise<string | undefined> {
	try {
		const res = await requestUrl({
			url: `https://www.youtube.com/watch?v=${videoId}`,
			method: "GET",
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
				"Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
			},
		});
		if (res.status >= 200 && res.status < 300 && typeof res.text === "string" && res.text.length > 50_000) {
			const found = extractPublishedAtFromWatchHtml(res.text);
			if (found) return found;
		}
	} catch {
		// Best-effort: if the watch page fails, fall back to relative time from the channel page.
	}
	const rel = channelHtml.match(/"publishedTimeText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/);
	if (rel?.[1]) return parseRelativeTimeToIso(rel[1]);
	return undefined;
}

function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'")
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function pickTag(block: string, tag: string): string | undefined {
	const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
	return m ? decodeEntities(m[1]).trim() || undefined : undefined;
}

function pickLinkHref(block: string): string | undefined {
	const m1 = block.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i);
	if (m1?.[1]) return decodeEntities(m1[1]).trim();
	const m2 = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
	if (m2?.[1]) return decodeEntities(m2[1]).trim();
	return undefined;
}

function pickThumbnail(block: string): string | undefined {
	const m = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
	if (m?.[1]) return decodeEntities(m[1]).trim() || undefined;
	return undefined;
}

function pickAuthorName(block: string): string | undefined {
	const m = block.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/i);
	return m ? decodeEntities(m[1]).trim() || undefined : undefined;
}

export function parseRssEntries(xml: string, fallbackChannelId: string, fallbackChannelName: string): RawFeedEntry[] {
	if (!/<feed[\s>]|<rss[\s>]/i.test(xml)) {
		throw new Error("Invalid feed.");
	}
	const feedChannelId = xml.match(/<yt:channelId>([^<]+)<\/yt:channelId>/i)?.[1]?.trim() ?? fallbackChannelId;
	const feedTitle = xml.match(/<feed[^>]*>[\s\S]*?<title>([^<]+)<\/title>/i)?.[1]?.trim();
	const feedAuthor = xml.match(/<feed[^>]*>[\s\S]*?<author>[\s\S]*?<name>([^<]+)<\/name>/i)?.[1]?.trim();
	const channelName = decodeEntities(feedAuthor ?? feedTitle ?? fallbackChannelName);

	const entries: RawFeedEntry[] = [];
	const blocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
	for (const block of blocks) {
		const videoId =
			block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1]?.trim() ??
			block.match(/<id>\s*yt:video:([^<]+)<\/id>/i)?.[1]?.trim();
		if (!videoId) continue;
		const title = pickTag(block, "title") ?? "Untitled video";
		const linkHref = pickLinkHref(block) ?? `https://www.youtube.com/watch?v=${videoId}`;
		const publishedAt = pickTag(block, "published") ?? pickTag(block, "updated");
		const entryChannelId = block.match(/<yt:channelId>([^<]+)<\/yt:channelId>/i)?.[1]?.trim() ?? feedChannelId;
		const entryAuthor = pickAuthorName(block) ?? channelName;
		const thumbnail = pickThumbnail(block);
		entries.push({
			videoId: videoId.trim(),
			title,
			linkHref,
			publishedAt,
			channelId: entryChannelId,
			channelName: entryAuthor,
			thumbnail,
		});
	}
	return entries;
}

export class NoEligibleVideosError extends Error {
	constructor() {
		super("Only recent Shorts were found; they are excluded.");
		this.name = "NoEligibleVideosError";
	}
}

export type RefreshErrorKind = "recoverable" | "permanent";

type ClassifiedRefreshError = Error & { status?: number; refreshErrorKind: RefreshErrorKind };

function userError(message: string, kind: RefreshErrorKind, status?: number): ClassifiedRefreshError {
	const error = new Error(message) as ClassifiedRefreshError;
	error.refreshErrorKind = kind;
	if (status !== undefined) error.status = status;
	return error;
}

export function isRecoverableRefreshError(e: unknown): boolean {
	if (e instanceof Error && (e as Partial<ClassifiedRefreshError>).refreshErrorKind) {
		return (e as ClassifiedRefreshError).refreshErrorKind === "recoverable";
	}
	return statusFromError(e) !== 404;
}

export function toUserError(e: unknown): ClassifiedRefreshError {
	if (e instanceof Error && (e as Partial<ClassifiedRefreshError>).refreshErrorKind) {
		return e as ClassifiedRefreshError;
	}
	const message = e instanceof Error ? e.message : "";
	const lower = message.toLowerCase();
	const status = statusFromError(e);

	if (status === 429) {
		return userError("YouTube is limiting requests. Wait a few minutes, then choose Refresh to try again.", "recoverable", status);
	}
	if (status === 403) {
		return userError("YouTube could not process the request. Wait a little, then choose Refresh to try again.", "recoverable", status);
	}
	if (status !== undefined && status >= 500 && status < 600) {
		return userError("YouTube is having trouble. Wait a little, then choose Refresh to try again.", "recoverable", status);
	}
	if (status === 404) {
		return userError("Could not check this channel. Check the link or try again later.", "permanent", status);
	}
	if (lower.includes("invalid feed") || lower.includes("invalid response") || lower.includes("feed inválido") || lower.includes("respuesta inválida")) {
		return userError("Could not read YouTube's response. Choose Refresh to try again later.", "recoverable");
	}
	if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("enotfound") || lower.includes("econn") || lower.includes("timeout") || lower.includes("abort") || lower.includes("sin conexión")) {
		return userError("No connection to YouTube. Check your network and choose Refresh to try again.", "recoverable");
	}
	return userError("Could not check this channel. Choose Refresh to try again later.", "recoverable");
}

export async function fetchChannelEntries(
	channelId: string,
	fetcher: RssXmlFetcher = defaultFetcher,
	maxAttempts = 3,
): Promise<RawFeedEntry[]> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const xml = await fetcher(channelId);
			try {
				return parseRssEntries(xml, channelId, channelId);
			} catch (e) {
				throw toUserError(e);
			}
		} catch (e) {
			lastError = e;
			const friendly = toUserError(e);
			const status = statusFromError(e);
			const retryable = status !== undefined ? isRetryableStatus(status) : /no connection|temporarily|try again later|sin conexión|temporalmente|bloqueo temporal/i.test(friendly.message);
			if (attempt >= maxAttempts || !retryable) {
				throw friendly;
			}
			const backoff = 1200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400);
			await sleep(backoff);
		}
	}
	throw toUserError(lastError);
}

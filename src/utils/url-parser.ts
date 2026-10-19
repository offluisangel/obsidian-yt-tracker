export type ParsedChannelUrl =
	| { kind: "channelId"; channelId: string }
	| { kind: "handle"; handlePath: string }
	| { kind: "invalid"; reason: string };

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const CHANNEL_SEG_RE = /\/channel\/(UC[A-Za-z0-9_-]{22})/i;
const HANDLE_AT_RE = /\/@([^/?#&\s]+)/;
const CUSTOM_RE = /\/(c|user)\/([^/?#&\s]+)/i;

export function isChannelId(value: string): boolean {
	return CHANNEL_ID_RE.test(value.trim());
}

export function buildChannelUrl(channelId: string): string {
	return `https://www.youtube.com/channel/${channelId}`;
}

export function buildHandleUrl(handlePath: string): string {
	const clean = handlePath.replace(/^\/+/, "");
	return `https://www.youtube.com/${clean}`;
}

function stripExtraPath(handle: string): string {
	return handle.split("/")[0].split("?")[0].split("#")[0].trim();
}

export function parseChannelUrl(input: string): ParsedChannelUrl {
	const raw = (input ?? "").trim();
	if (!raw) {
		return { kind: "invalid", reason: "Enter a channel URL." };
	}

	let url: URL;
	try {
		const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
		url = new URL(withProto);
	} catch {
		return { kind: "invalid", reason: "Invalid URL." };
	}

	const host = url.hostname.toLowerCase().replace(/^m\./, "www.");
	const isYoutube =
		host === "youtube.com" ||
		host === "www.youtube.com" ||
		host === "youtu.be";
	if (!isYoutube) {
		return { kind: "invalid", reason: "Tiene que ser una URL de youtube.com." };
	}
	if (host === "youtu.be") {
		return { kind: "invalid", reason: "That is a video URL, not a channel URL." };
	}

	const path = url.pathname;

	const channelMatch = path.match(CHANNEL_SEG_RE);
	if (channelMatch) {
		return { kind: "channelId", channelId: channelMatch[1] };
	}

	const atMatch = path.match(HANDLE_AT_RE);
	if (atMatch) {
		const handle = stripExtraPath(atMatch[1]);
		if (!handle) {
			return { kind: "invalid", reason: "The channel handle is empty." };
		}
		return { kind: "handle", handlePath: `@${handle}` };
	}

	const customMatch = path.match(CUSTOM_RE);
	if (customMatch) {
		const prefix = customMatch[1].toLowerCase();
		const name = stripExtraPath(customMatch[2]);
		if (!name) {
			return { kind: "invalid", reason: "The channel name is empty." };
		}
		return { kind: "handle", handlePath: `${prefix}/${name}` };
	}

	// Bare UC id pasted directly
	const bare = raw.trim().replace(/^https?:\/\/[^/]+\//, "");
	if (isChannelId(bare)) {
		return { kind: "channelId", channelId: bare };
	}

	return {
		kind: "invalid",
		reason: "Unrecognized URL. Try /channel/ID or /@handle.",
	};
}

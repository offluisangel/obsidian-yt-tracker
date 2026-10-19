import type { TrackerSettings } from "./types";

export const DEFAULT_SETTINGS: TrackerSettings = {
	channels: [],
};

function normalizeStoredError(value: unknown): {
	message?: string;
	kind?: "recoverable" | "permanent";
	result?: "no-eligible-videos";
} {
	if (typeof value !== "string" || !value) return {};
	const lower = value.toLowerCase();
	if (lower.includes("solo se encontraron shorts")) return { result: "no-eligible-videos" };
	if (lower.includes("429") || lower.includes("limitó las consultas")) {
		return { message: "YouTube is limiting requests. Wait a few minutes, then choose Refresh to try again.", kind: "recoverable" };
	}
	if (lower.includes("sin conexión") || lower.includes("no connection")) {
		return { message: "No connection to YouTube. Check your network and choose Refresh to try again.", kind: "recoverable" };
	}
	if (lower.includes("403") || lower.includes("rechazó la consulta")) {
		return { message: "YouTube could not process the request. Wait a little, then choose Refresh to try again.", kind: "recoverable" };
	}
	if (lower.includes("404") || lower.includes("canal no encontrado")) {
		return { message: "Could not check this channel. Check the link or try again later.", kind: "permanent" };
	}
	if (lower.includes("inválido") || lower.includes("respuesta inválida")) {
		return { message: "Could not read YouTube's response. Choose Refresh to try again later.", kind: "recoverable" };
	}
	if (/[áéíóúñ¿¡]/i.test(value) || lower.includes("no se pudo") || lower.includes("no pudimos") || lower.includes("no pude")) {
		return { message: "Could not check this channel. Choose Refresh to try again later.", kind: "recoverable" };
	}
	return { message: value };
}

export function normalizeSettings(data: unknown): TrackerSettings {
	if (!data || typeof data !== "object") {
		return { ...DEFAULT_SETTINGS, channels: [] };
	}
	const raw = data as Partial<TrackerSettings>;
	const channels = Array.isArray(raw.channels)
		? raw.channels
			.filter(
				(c): c is NonNullable<TrackerSettings["channels"]>[number] =>
					!!c && typeof c === "object" && typeof (c as { channelId?: unknown }).channelId === "string" && (c as { channelId: string }).channelId.length > 0,
			)
			.map((channel) => {
				const storedError = normalizeStoredError(channel.lastError);
				return {
					...channel,
					lastFetchedAt: typeof channel.lastFetchedAt === "number" ? channel.lastFetchedAt : undefined,
					lastAttemptAt: typeof channel.lastAttemptAt === "number" ? channel.lastAttemptAt : undefined,
					lastResult: ["video", "no-eligible-videos", "empty"].includes(channel.lastResult ?? "") ? channel.lastResult : storedError.result,
					lastError: storedError.message,
					lastErrorKind: ["recoverable", "permanent"].includes(channel.lastErrorKind ?? "") ? channel.lastErrorKind : storedError.kind,
				};
			})
		: [];
	return {
		channels,
		lastGlobalRefreshAt: typeof raw.lastGlobalRefreshAt === "number" ? raw.lastGlobalRefreshAt : undefined,
		lastSuccessfulRefreshAt: typeof raw.lastSuccessfulRefreshAt === "number" ? raw.lastSuccessfulRefreshAt : undefined,
	};
}

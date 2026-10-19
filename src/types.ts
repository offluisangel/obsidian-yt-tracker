export interface VideoEntry {
	videoId: string;
	title: string;
	url: string;
	publishedAt?: string;
	channelId: string;
	channelName: string;
	thumbnail?: string;
	shortStatus: "short" | "not-short" | "unknown";
}

export interface TrackedChannel {
	channelId: string;
	name: string;
	channelUrl: string;
	lastVideo?: VideoEntry;
	lastFetchedAt?: number;
	lastAttemptAt?: number;
	lastResult?: "video" | "no-eligible-videos" | "empty";
	lastError?: string;
	lastErrorKind?: "recoverable" | "permanent";
}

export interface TrackerSettings {
	channels: TrackedChannel[];
	lastGlobalRefreshAt?: number;
	lastSuccessfulRefreshAt?: number;
}

import type { TrackedChannel } from "../types";

export function getEmptyDashboardCopy(): { title: string; description: string } {
	return {
		title: "Keep up with your favorite channels",
		description: "Add a YouTube channel and choose Refresh whenever you want to check for new videos. Updates are manual, and Shorts are filtered out.",
	};
}

export function getChannelEmptyCopy(result: TrackedChannel["lastResult"]): string {
	if (result === "no-eligible-videos") {
		return "No long-form videos were found among recent uploads. Shorts are filtered out.";
	}
	if (result === "empty") return "No recent videos to show.";
	return "No data yet. Choose Refresh to check this channel for recent videos.";
}

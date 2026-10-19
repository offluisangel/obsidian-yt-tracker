import { test } from "node:test";
import assert from "node:assert/strict";
import { selectLatestNonShort } from "../src/services/video-selector";
import * as youtubeRss from "../src/services/youtube-rss";
import * as dateUtils from "../src/utils/date-utils";
import * as settings from "../src/settings";
import * as uiCopy from "../src/ui/copy";
import * as releaseVersioning from "../src/release/versioning.mjs";

const SHORT_ID = "SHORTID1234";
const LONG_ID = "LONGVID12345";

function entry(videoId: string, linkHref: string, publishedAt: string) {
	return { videoId, title: videoId, linkHref, publishedAt, channelId: "UC123", channelName: "Channel" };
}

test("Shorts entries are skipped in favor of the newest regular video", () => {
	const result = selectLatestNonShort([
		entry(SHORT_ID, `https://www.youtube.com/shorts/${SHORT_ID}`, "2025-05-02T00:00:00Z"),
		entry(LONG_ID, `https://www.youtube.com/watch?v=${LONG_ID}`, "2025-05-01T00:00:00Z"),
	]);
	assert.equal(result.kind, "video");
	if (result.kind === "video") assert.equal(result.entry.videoId, LONG_ID);
});

test("all-Shorts feed produces no video", () => {
	assert.deepEqual(selectLatestNonShort([
		entry(SHORT_ID, `https://www.youtube.com/shorts/${SHORT_ID}`, "2025-05-02T00:00:00Z"),
	]), { kind: "all-shorts" });
});

test("fallback HTML identifies Shorts IDs so they can be filtered", () => {
	const html = `<a href="/shorts/${SHORT_ID}">short</a><a href="/watch?v=${LONG_ID}">video</a>`;
	assert.deepEqual(youtubeRss.extractShortVideoIdsFromHtml(html), [SHORT_ID]);
});

test("age formatter presents elapsed time instead of a locale timestamp", () => {
	const now = Date.parse("2025-05-05T12:00:00Z");
	assert.equal(dateUtils.formatAge("2025-05-05T11:58:00Z", now), "2 min ago");
	assert.equal(dateUtils.formatAge("not-a-date", now), "Unknown date");
	assert.equal(dateUtils.formatDateTime("not-a-date"), "Unknown date");
});

test("legacy Spanish refresh errors load with English user-facing copy", () => {
	const normalized = settings.normalizeSettings({
		channels: [
			{ channelId: "UC123", lastError: "Sin conexión a YouTube. Revisá tu red." },
			{ channelId: "UC456", lastError: "No se pudo consultar el feed." },
			{ channelId: "UC789", lastError: "Solo se encontraron Shorts recientes." },
		],
	});
	assert.equal(normalized.channels[0].lastError, "No connection to YouTube. Check your network and choose Refresh to try again.");
	assert.equal(normalized.channels[1].lastError, "Could not check this channel. Choose Refresh to try again later.");
	assert.equal(normalized.channels[2].lastError, undefined);
	assert.equal(normalized.channels[2].lastResult, "no-eligible-videos");
});

test("first-use copy explains manual refresh and Shorts exclusion", () => {
	assert.deepEqual(uiCopy.getEmptyDashboardCopy(), {
		title: "Keep up with your favorite channels",
		description: "Add a YouTube channel and choose Refresh whenever you want to check for new videos. Updates are manual, and Shorts are filtered out.",
	});
});

test("channel empty states distinguish not-yet-refreshed from no eligible videos", () => {
	assert.equal(uiCopy.getChannelEmptyCopy(undefined), "No data yet. Choose Refresh to check this channel for recent videos.");
	assert.equal(uiCopy.getChannelEmptyCopy("no-eligible-videos"), "No long-form videos were found among recent uploads. Shorts are filtered out.");
	assert.equal(uiCopy.getChannelEmptyCopy("empty"), "No recent videos to show.");
});

test("release metadata keeps the manifest version and compatibility map in sync", () => {
	const result = releaseVersioning.updateReleaseMetadata(
		"0.2.0",
		{ version: "0.1.0", minAppVersion: "1.12.7" },
		{ "0.1.0": "1.12.7" },
	);
	assert.equal(result.manifest.version, "0.2.0");
	assert.deepEqual(result.versions, { "0.1.0": "1.12.7", "0.2.0": "1.12.7" });
	assert.throws(() => releaseVersioning.updateReleaseMetadata("next", { minAppVersion: "1.12.7" }, {}), /valid semantic version/);
});

test("refresh errors hide technical status codes and give a useful next step", () => {
	const limited = youtubeRss.toUserError(new Error("Feed responded 429."));
	assert.equal(limited.message, "YouTube is limiting requests. Wait a few minutes, then choose Refresh to try again.");
	assert.equal(limited.refreshErrorKind, "recoverable");
	assert.equal(youtubeRss.isRecoverableRefreshError(limited), true);

	const missing = youtubeRss.toUserError(new Error("Feed responded 404."));
	assert.equal(missing.message, "Could not check this channel. Check the link or try again later.");
	assert.equal(missing.refreshErrorKind, "permanent");
	assert.equal(youtubeRss.isRecoverableRefreshError(missing), false);
});

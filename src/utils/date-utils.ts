export function parseDateSafe(value?: string): number | undefined {
	if (!value) return undefined;
	const t = Date.parse(value);
	return Number.isNaN(t) ? undefined : t;
}

export function formatDateTime(iso?: string): string {
	if (!iso) return "Unknown date";
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return "Unknown date";
	return new Date(t).toLocaleString("en-US");
}

export function formatAge(value?: number | string, now = Date.now()): string {
	const timestamp = typeof value === "number" ? value : value ? Date.parse(value) : Number.NaN;
	if (!Number.isFinite(timestamp)) return "Unknown date";
	const elapsed = Math.max(0, now - timestamp);
	const minutes = Math.floor(elapsed / 60_000);
	if (minutes < 1) return "less than a minute ago";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours} hr ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
	const years = Math.floor(days / 365);
	return `${years} ${years === 1 ? "year" : "years"} ago`;
}

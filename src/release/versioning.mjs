const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function updateReleaseMetadata(version, manifest, versions) {
	if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
		throw new Error("A valid semantic version is required.");
	}
	if (!manifest || typeof manifest.minAppVersion !== "string" || !manifest.minAppVersion) {
		throw new Error("A minimum Obsidian version is required.");
	}
	return {
		manifest: { ...manifest, version },
		versions: { ...versions, [version]: manifest.minAppVersion },
	};
}

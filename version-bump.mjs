import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { updateReleaseMetadata } from "./src/release/versioning.mjs";

const root = dirname(fileURLToPath(import.meta.url));

async function readJson(path, fallback) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return fallback;
		throw error;
	}
}

const packageJson = await readJson(join(root, "package.json"), {});
const manifest = await readJson(join(root, "manifest.json"), {});
const versions = await readJson(join(root, "versions.json"), {});
const updated = updateReleaseMetadata(packageJson.version, manifest, versions);

await Promise.all([
	writeFile(join(root, "manifest.json"), `${JSON.stringify(updated.manifest, null, 2)}\n`),
	writeFile(join(root, "versions.json"), `${JSON.stringify(updated.versions, null, 2)}\n`),
]);

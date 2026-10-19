import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const outDir = mkdtempSync(join(tmpdir(), "youtube-tracker-tests-"));
try {
	await build({
		entryPoints: ["tests/core.test.ts"],
		outfile: join(outDir, "core.test.cjs"),
		bundle: true,
		platform: "node",
		format: "cjs",
		target: "node20",
		plugins: [
			{
				name: "obsidian-test-stub",
				setup(build) {
					build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "test-stub" }));
					build.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({
						contents: "export const requestUrl = async () => { throw new Error('requestUrl is unavailable in unit tests'); };",
						loader: "js",
					}));
				},
			},
		],
	});
	const result = spawnSync(process.execPath, ["--test", join(outDir, "core.test.cjs")], { stdio: "inherit" });
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(outDir, { recursive: true, force: true });
}

import { rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildTagTranslationModule } from "./tag-translation-generator.mjs";

const repository = "JodieRuth/VNDB-Profile-Search";
const run = promisify(execFile);
const ghApi = async (path, raw = false) => {
  const args = ["api", path];
  if (raw) args.push("-H", "Accept: application/vnd.github.raw+json");
  const { stdout } = await run("gh", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
};

const commit = JSON.parse(await ghApi(`repos/${repository}/commits/main`));
const source = JSON.parse(
  await ghApi(
    `repos/${repository}/contents/public/data/vndb-meta-translations.json?ref=${commit.sha}`,
    true,
  ),
);
const moduleText = buildTagTranslationModule(source, commit.sha);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "apps/api/src/tag-translations.generated.ts");
const temporary = `${target}.tmp`;
await writeFile(temporary, moduleText, "utf8");
await rename(temporary, target);
console.log(`Updated ${target} from ${commit.sha}`);

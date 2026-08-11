import test from "node:test";
import assert from "node:assert/strict";
import { buildTagTranslationModule } from "./tag-translation-generator.mjs";

test("decodes and sorts valid Tag translations while rejecting unrelated entries", () => {
  const source = {
    tags: {
      20: {
        vndbId: "g20",
        en: "Character",
        zh: "角色",
        enEncoded: false,
        zhEncoded: false,
      },
      19: {
        vndbId: "g19",
        en: Buffer.from("Mystery").toString("base64"),
        zh: Buffer.from("悬疑").toString("base64"),
        enEncoded: true,
        zhEncoded: true,
      },
      broken: { vndbId: "i1", en: "Trait", zh: "特征" },
    },
  };

  const output = buildTagTranslationModule(source, "abc123");

  assert.match(output, /source commit: abc123/);
  assert.match(output, /"g19": \{ en: "Mystery", zhHans: "悬疑" \}/);
  assert.doesNotMatch(output, /"i1"/);
  assert.ok(output.indexOf('"g19"') < output.indexOf('"g20"'));
});

test("rejects malformed upstream data instead of emitting a partial module", () => {
  assert.throws(
    () => buildTagTranslationModule({ traits: {} }, "abc123"),
    /missing tags/i,
  );
});

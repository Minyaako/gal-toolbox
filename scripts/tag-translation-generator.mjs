const decode = (value, encoded) => {
  if (typeof value !== "string") return "";
  return encoded ? Buffer.from(value, "base64").toString("utf8").trim() : value.trim();
};

export function buildTagTranslationModule(source, sourceCommit) {
  if (!source || typeof source !== "object" || !source.tags || typeof source.tags !== "object") {
    throw new Error("Upstream translation data is missing tags");
  }
  if (typeof sourceCommit !== "string" || !sourceCommit.trim()) {
    throw new Error("Source commit is required");
  }

  const entries = Object.values(source.tags)
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object" || typeof entry.vndbId !== "string") return [];
      if (!/^g\d+$/.test(entry.vndbId)) return [];
      const en = decode(entry.en, entry.enEncoded);
      const zhHans = decode(entry.zh, entry.zhEncoded);
      return en && zhHans ? [{ id: entry.vndbId, en, zhHans }] : [];
    })
    .sort((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)));

  const rows = entries
    .map(({ id, en, zhHans }) => `  ${JSON.stringify(id)}: { en: ${JSON.stringify(en)}, zhHans: ${JSON.stringify(zhHans)} },`)
    .join("\n");

  return `/**
 * Generated from JodieRuth/VNDB-Profile-Search.
 * source commit: ${sourceCommit}
 * Translation attribution: VNDB Profile Search contributors (CC BY 4.0).
 * Run npm run sync:tag-translations to refresh.
 */
export type TagTranslation = { en: string; zhHans: string };

export const TAG_TRANSLATIONS = {
${rows}
} as const satisfies Readonly<Record<string, TagTranslation>>;
`;
}

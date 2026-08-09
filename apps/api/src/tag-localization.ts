import type { EntityName } from "./types.js";
import { TAG_TRANSLATIONS } from "./tag-translations.generated.js";

const unique = (values: string[]) => [...new Set(values.filter((value) => value.trim()))];

export function localizeTagName(
  id: string,
  english: string,
  aliases: string[] = [],
): EntityName {
  const translation = TAG_TRANSLATIONS[id as keyof typeof TAG_TRANSLATIONS];
  if (!translation) {
    return {
      primary: english,
      original: null,
      romanized: null,
      alternatives: unique(aliases).filter((value) => value !== english),
    };
  }

  return {
    primary: translation.zhHans,
    original: translation.en === translation.zhHans ? null : translation.en,
    romanized: null,
    alternatives: unique(aliases).filter(
      (value) => value !== translation.zhHans && value !== translation.en,
    ),
  };
}

export type LocalizedTagMatch = {
  id: string;
  en: string;
  zhHans: string;
};

const matchScore = (value: string, term: string) => {
  if (value === term) return 0;
  if (value.startsWith(term)) return 1;
  if (value.includes(term)) return 2;
  return 3;
};

export function searchLocalizedTags(term: string): LocalizedTagMatch[] {
  const normalized = term.trim().toLocaleLowerCase();
  if (!normalized) return [];

  return Object.entries(TAG_TRANSLATIONS)
    .flatMap(([id, translation]) => {
      const score = Math.min(
        matchScore(translation.zhHans.toLocaleLowerCase(), normalized),
        matchScore(translation.en.toLocaleLowerCase(), normalized),
      );
      return score < 3 ? [{ id, ...translation, score }] : [];
    })
    .sort((left, right) =>
      left.score - right.score ||
      left.en.localeCompare(right.en, "en") ||
      Number(left.id.slice(1)) - Number(right.id.slice(1)),
    )
    .map(({ score: _score, ...tag }) => tag);
}

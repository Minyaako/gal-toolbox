import type { EntityName } from "./api";

export function getSecondaryName(name: EntityName): string | null {
  const secondary = name.original ?? name.romanized;
  return secondary && secondary !== name.primary ? secondary : null;
}

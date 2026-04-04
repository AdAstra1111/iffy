import { normalizeCharacterKey } from '@/lib/aiCast/normalizeCharacterKey';

export function extractCanonicalCharacterNames(canonJson: any): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const addName = (raw: unknown) => {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name || name === 'Unknown') return;
    const key = normalizeCharacterKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  if (Array.isArray(canonJson?.characters)) {
    for (const character of canonJson.characters) {
      if (typeof character === 'string') addName(character);
      else addName(character?.name || character?.character_name);
    }
  }

  const wardrobeProfiles = canonJson?.character_wardrobe_profiles?.profiles;
  if (Array.isArray(wardrobeProfiles)) {
    for (const profile of wardrobeProfiles) {
      addName(profile?.character_name || profile?.character_id_or_key);
    }
  }

  return names;
}

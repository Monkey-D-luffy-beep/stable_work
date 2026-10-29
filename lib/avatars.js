// Profile pictures people can choose from. Files live in /public/avatars.
export const AVATAR_SETS = [
  { id: 'team', label: 'Logistics team', prefix: 'team', count: 15 },
  { id: 'modern', label: 'Modern', prefix: 'modern', count: 20 },
  { id: 'cartoon', label: 'Cartoon', prefix: 'cartoon', count: 24, skip: [6] },
];

const pad = (n) => String(n).padStart(2, '0');

export const avatarsOf = (set) =>
  Array.from({ length: set.count }, (_, i) => i + 1)
    .filter((n) => !set.skip?.includes(n))
    .map((n) => `/avatars/${set.prefix}-${pad(n)}.png`);

export const ALL_AVATARS = AVATAR_SETS.flatMap(avatarsOf);
export const isAvatar = (p) => ALL_AVATARS.includes(p);

// Friendly default for people who do not pick one: stable per email, drawn from the people in the logistics set.
export function defaultAvatar(seed = '') {
  let h = 0;
  for (const c of String(seed).toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const people = avatarsOf(AVATAR_SETS[0]).slice(0, 14);
  return people[h % people.length];
}

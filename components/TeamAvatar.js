import { PRESETS } from '@/lib/presets';

export default function TeamAvatar({ team, size = 36 }) {
  const radius = Math.round(size * 0.28);
  if (team.avatar?.startsWith('http'))
    return <img src={team.avatar} alt="" width={size} height={size} style={{ borderRadius: radius, objectFit: 'cover', flex: 'none' }} />;
  const p = PRESETS.find((x) => x.id === team.avatar) || PRESETS[0];
  return (
    <span className="preset" style={{ width: size, height: size, borderRadius: radius, background: p.bg, fontSize: size * 0.5 }}>
      {p.emoji}
    </span>
  );
}

import { PRESETS } from '@/lib/presets';

// Pick a default picture or upload your own (an upload wins over the preset).
export default function AvatarPicker({ current }) {
  const selected = PRESETS.some((p) => p.id === current) ? current : current?.startsWith('http') ? '' : 'tiger';
  return (
    <div className="picker">
      <span className="label">Team picture</span>
      <div className="presets">
        {PRESETS.map((p) => (
          <label key={p.id} className="pick">
            <input type="radio" name="preset" value={p.id} defaultChecked={p.id === selected} />
            <span style={{ background: p.bg }}>{p.emoji}</span>
          </label>
        ))}
      </div>
      <label className="upload">
        …or upload a group photo
        <input type="file" name="picture" accept="image/*" />
      </label>
    </div>
  );
}

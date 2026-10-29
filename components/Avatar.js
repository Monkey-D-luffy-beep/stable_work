const initials = (n) => (n || '?').split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// A person's picture, or their initials when they do not have one.
export default function Avatar({ src, name, size = 28, className = '' }) {
  if (src) return <img className={`avatar-img ${className}`} src={src} alt="" width={size} height={size} title={name} />;
  return (
    <span className={`av ${className}`} title={name} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}>
      {initials(name)}
    </span>
  );
}

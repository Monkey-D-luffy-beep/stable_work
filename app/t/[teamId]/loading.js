// Shown instantly while a team page loads, so navigation never feels frozen.
export default function Loading() {
  return (
    <div className="stack" aria-busy="true">
      <div className="skeleton" style={{ height: 40, width: 260 }} />
      <div className="stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 92 }} />)}
      </div>
      <div className="skeleton" style={{ height: 56 }} />
      <div className="skeleton" style={{ height: 260 }} />
    </div>
  );
}

// The Stableworks name, set in type. No ship icon — just the wordmark, in a dark or light variant
// for use on light or dark (purple) backgrounds.
export default function Wordmark({ light = false, className = '' }) {
  return (
    <span className={`wordmark ${light ? 'on-dark' : ''} ${className}`}>
      stable<b>works</b>
    </span>
  );
}

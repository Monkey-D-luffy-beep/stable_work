import { login } from '../actions';

export default async function Login({ searchParams }) {
  const { sent, error, next } = await searchParams;
  return (
    <main className="center">
      <div className="auth-card">
        <img src="/logo.png" alt="Tiger Logistics" className="auth-logo" />
        <h1>Sign in</h1>
        {sent ? (
          <p className="notice">Check <b>{sent}</b> for your sign-in link.</p>
        ) : (
          <>
            <p className="sub">We'll email you a magic link. No password needed.</p>
            {error && <p className="error">{error}</p>}
            <form action={login} className="stack">
              <input type="hidden" name="next" value={next || '/'} />
              <input name="email" type="email" placeholder="you@company.com" required autoFocus />
              <button className="btn primary">Email me a link</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

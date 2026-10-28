import Link from 'next/link';
import SubmitButton from '@/components/SubmitButton';
import { login, signInPassword, signUpPassword } from '../actions';

export default async function Login({ searchParams }) {
  const { sent, error, next, mode = 'signin' } = await searchParams;
  const nextVal = next || '/';
  const q = (m) => `/login?mode=${m}${next ? `&next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main className="login">
      <aside className="login-brand">
        <Link href="/"><img className="brand-logo" src="/logo-white.png" alt="Stableworks" /></Link>
        <div>
          <h2>Every project, <em>on course.</em></h2>
          <p>Plan the work, assign it, review it and keep the full history in one place.</p>
          <ul>
            <li>A team for every project</li>
            <li>Urgency, deadlines and follow-ups</li>
            <li>Reviews and a complete task history</li>
            <li>Weekly and monthly reports by email</li>
          </ul>
        </div>
        <small>© {new Date().getFullYear()} Stableworks</small>
      </aside>

      <section className="login-form">
        <div className="login-box">
          {sent ? (
            <>
              <h1>Check your email</h1>
              <p className="notice">We sent a sign-in link to <b>{sent}</b>. Open the newest email only.</p>
              <Link href={q('signin')} className="sub">← Back to sign in</Link>
            </>
          ) : mode === 'link' ? (
            <>
              <h1>Email me a link</h1>
              <p className="sub">We'll email a one-time sign-in link. No password needed.</p>
              {error && <p className="error">{error}</p>}
              <form action={login} className="panel stack">
                <input type="hidden" name="next" value={nextVal} />
                <input name="email" type="email" placeholder="you@company.com" required autoFocus />
                <SubmitButton className="btn primary" pendingText="Sending…">Email me a link</SubmitButton>
              </form>
              <Link href={q('signin')} className="sub">← Use a password instead</Link>
            </>
          ) : (
            <>
              <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
              <p className="sub">{mode === 'signup' ? 'Start organising your team in a minute.' : 'Sign in to your Stableworks workspace.'}</p>
              {error && <p className="error">{error}</p>}
              <form action={mode === 'signup' ? signUpPassword : signInPassword} className="panel stack">
                <input type="hidden" name="next" value={nextVal} />
                <input name="email" type="email" placeholder="you@company.com" required autoFocus />
                <input name="password" type="password" minLength={8} required
                  placeholder={mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                <SubmitButton className="btn primary" pendingText={mode === 'signup' ? 'Creating…' : 'Signing in…'}>
                  {mode === 'signup' ? 'Create account' : 'Sign in'}
                </SubmitButton>
              </form>
              <p className="sub">
                {mode === 'signup'
                  ? <>Already have an account? <Link href={q('signin')}><b>Sign in</b></Link></>
                  : <>New here? <Link href={q('signup')}><b>Create an account</b></Link></>}
                {' · '}<Link href={q('link')}>Email me a link instead</Link>
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

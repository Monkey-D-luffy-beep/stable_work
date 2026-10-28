import Link from 'next/link';

const ICONS = {
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>,
  check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  bell: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  history: <><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><polyline points="12 7 12 12 16 14" /></>,
};
const Icon = ({ name }) => <span className="ico"><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg></span>;

const FEATURES = [
  ['users', 'A team for every project', 'Create a team per project, pick a team picture, and invite exactly the people who belong on it. One person can be in many teams.'],
  ['shield', 'Assign to a person or the whole team', 'Give a task to one teammate or to everyone at once, so it is always clear who owns what.'],
  ['flag', 'Urgency and deadlines', 'Mark tasks low to urgent, add a deadline if there is one, and attach notes. Overdue work is highlighted so it never hides.'],
  ['check', 'Reviews when you need them', 'Ask a teammate to look over finished work. They can approve it or send it back with comments, and you are notified by email.'],
  ['bell', 'Follow-ups that stick', 'Set a follow-up date and reminder note on any task so nothing is forgotten once it leaves your hands.'],
  ['history', 'Complete task history', 'Every change, note, review and follow-up is recorded with who did it and when, so you can always see what happened.'],
];

const FAQ = [
  ['Who can see which tasks?', 'Everyone in a team sees the tasks assigned to them or to the whole team. Team leads can see every task in the team.'],
  ['Can I be in more than one team?', 'Yes. Create a team for each project and switch between them from the sidebar.'],
  ['How do invites work?', 'Enter email addresses when creating a team, or later from the Members page. Each person gets a link by email, and you can also copy the link directly.'],
  ['What reports are sent?', 'A weekly report goes out every Monday and a monthly report on the 1st, summarising what was completed, what is overdue and what is waiting for review.'],
  ['Is task history kept?', 'Yes. Every update, note, review decision and follow-up is stored on the task with the person and time.'],
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <Link href="/"><img src="/logo.png" alt="Stableworks" /></Link>
          <nav className="lp-links">
            <a href="#features">Features</a><a href="#how">How it works</a><a href="#reports">Reports</a><a href="#faq">FAQ</a>
          </nav>
          <div className="cta">
            <Link href="/login" className="btn">Sign in</Link>
            <Link href="/login" className="btn primary">Get started</Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap">
          <div>
            <span className="eyebrow">Project management for logistics teams</span>
            <h1>Every task, every team, <em>one clear view.</em></h1>
            <p className="lp-lead">Assign work, set urgency and deadlines, ask for reviews and keep a full history of every task. Weekly reports land in your inbox automatically.</p>
            <div className="lp-btns">
              <Link href="/login" className="btn primary">Start with your team</Link>
              <a href="#how" className="btn">See how it works</a>
            </div>
            <p className="lp-note">Sign in with your email. No password to remember.</p>
          </div>

          <div className="mock" aria-label="Sample view of the task board">
            <div className="mock-bar"><i /><i /><i /><span>Export Operations · sample</span></div>
            <div className="mock-body">
              <div className="mock-stats">
                <div>Open<b>12</b></div><div>Overdue<b>2</b></div><div>To review<b>3</b></div>
              </div>
              {[
                ['Customs clearance: Mundra shipment', 'urgent', 'PR', 'In review'],
                ['Invoice for export consignment', 'high', 'AM', 'In progress'],
                ['Draft Bill of Lading (BL)', 'high', 'RK', 'In progress'],
                ['Freight booking: Nhava Sheva to Rotterdam', 'medium', 'SP', 'To do'],
                ['Marketing: LinkedIn campaign', 'medium', 'NK', 'To do'],
                ['Website update: tracking page', 'low', 'DV', 'Done'],
              ].map(([t, u, w, s]) => (
                <div className="mock-row" key={t}>
                  <span className="grow">{t}</span>
                  <span className={`tag ${u}`}>{u}</span>
                  <span className="sub">{s}</span>
                  <span className="who">{w}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="features">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2>Everything a team needs to get work done</h2>
            <p>Simple enough to use on day one, with the structure a growing team needs.</p>
          </div>
          <div className="feat-grid">
            {FEATURES.map(([icon, title, text]) => (
              <div className="feat" key={title}><Icon name={icon} /><h3>{title}</h3><p>{text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="how">
        <div className="lp-wrap">
          <div className="lp-head"><h2>Up and running in three steps</h2><p>No setup project required.</p></div>
          <div className="steps">
            <div className="step"><h3>Create a team</h3><p>Name it after the project and choose a team picture, or upload a group photo.</p></div>
            <div className="step"><h3>Invite your people</h3><p>Enter their emails. They join with one click and appear in the team instantly.</p></div>
            <div className="step"><h3>Assign and track</h3><p>Add tasks, set urgency, request reviews and follow up, with the history kept for you.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="reports">
        <div className="lp-wrap">
          <div className="band">
            <div>
              <h2>Reports land in your inbox, automatically</h2>
              <p>Every Monday you get a weekly summary and on the 1st a monthly one: what was completed, what is overdue and what is waiting for review.</p>
            </div>
            <div className="mail" aria-hidden="true">
              <span>Weekly report · Export Operations</span>
              <div className="stats3">
                <span className="g"><b>9</b>Completed</span><span><b>14</b>Created</span><span><b>2</b>Overdue</span>
              </div>
              <span className="sub">Sent every Monday</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="faq">
        <div className="lp-wrap">
          <div className="lp-head"><h2>Frequently asked questions</h2></div>
          <div className="faq">
            {FAQ.map(([q, a]) => (<details key={q}><summary>{q}</summary><p>{a}</p></details>))}
          </div>
        </div>
      </section>

      <section className="cta-final">
        <div className="lp-wrap">
          <h2>Ready to get your team organised?</h2>
          <p>Create your first team in under a minute.</p>
          <Link href="/login" className="btn primary">Get started</Link>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="badge"><img src="/logo.png" alt="Stableworks" /></div>
          <nav><a href="#features">Features</a><a href="#how">How it works</a><a href="#reports">Reports</a><a href="#faq">FAQ</a><Link href="/login">Sign in</Link></nav>
          <small>© {new Date().getFullYear()} Stableworks. All rights reserved.</small>
        </div>
      </footer>
    </div>
  );
}

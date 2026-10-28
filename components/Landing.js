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
  ['shield', 'Roles that keep it simple', 'Managers see every task and assign work to the whole team or one person. Members see their own tasks and anything given to the team.'],
  ['flag', 'Urgency and deadlines', 'Mark tasks low to urgent, add a deadline if there is one, and attach notes. Overdue work is highlighted so it never hides.'],
  ['check', 'Built-in review', 'Members request a review when work is ready. Managers approve it or send it back with feedback, and everyone is notified by email.'],
  ['bell', 'Follow-ups that stick', 'Set a follow-up date and reminder note on any task so nothing is forgotten once it leaves your hands.'],
  ['history', 'Complete task history', 'Every change, note, review and follow-up is recorded with who did it and when, so you can always see what happened.'],
];

const FAQ = [
  ['How do roles work?', 'Each team has managers and members. Managers see all tasks in the team, assign tasks to the whole team or a person, review work and manage members. Members see tasks assigned to them, created by them, or given to the whole team.'],
  ['Can I be in more than one team?', 'Yes. Create a team for each project and switch between them from the sidebar. Your role can differ in every team.'],
  ['How do invites work?', 'A manager enters email addresses, either when creating the team or later from the Members page. Each person gets a link by email, and the manager can also copy the link directly.'],
  ['What reports are sent?', 'A weekly report goes out every Monday and a monthly report on the 1st. Managers receive the whole team with a breakdown by person; members receive their own tasks.'],
  ['Is task history kept?', 'Yes. Every update, note, review decision and follow-up is stored on the task with the person and time.'],
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <Link href="/"><img src="/logo.png" alt="Tiger Logistics" /></Link>
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
            <span className="eyebrow">Task management for Tiger Logistics teams</span>
            <h1>Every task, every team, <em>one clear view.</em></h1>
            <p className="lp-lead">Assign work, set urgency and deadlines, request reviews and keep a full history. Managers stay in control without chasing updates, and reports arrive in the inbox every week.</p>
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
            <div className="mock-float"><b>✓</b> Review approved by your manager</div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="features">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2>Everything a team needs to get work done</h2>
            <p>Simple enough to use on day one, with the structure managers need to stay on top of it.</p>
          </div>
          <div className="feat-grid">
            {FEATURES.map(([icon, title, text]) => (
              <div className="feat" key={title}><Icon name={icon} /><h3>{title}</h3><p>{text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec alt">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2>The right view for each role</h2>
            <p>Managers get the whole picture. Members get a focused list.</p>
          </div>
          <div className="split">
            <div className="role dark">
              <span className="tag manager">Manager</span>
              <h3>See everything, assign anything</h3>
              <p>Oversee the team without asking for status updates.</p>
              <ul>
                <li>View every task across the team</li>
                <li>Assign to the whole team or one person</li>
                <li>Approve work or request changes</li>
                <li>Invite and manage members</li>
                <li>Receive the full team report</li>
              </ul>
            </div>
            <div className="role">
              <span className="tag member">Member</span>
              <h3>Focus on your own work</h3>
              <p>A clear list of what is yours, with nothing extra.</p>
              <ul>
                <li>See tasks assigned to you or your team</li>
                <li>Add tasks with urgency, deadline and notes</li>
                <li>Request a review when work is ready</li>
                <li>Leave notes and set follow-ups</li>
                <li>Receive your own weekly report</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="how">
        <div className="lp-wrap">
          <div className="lp-head"><h2>Up and running in three steps</h2><p>No setup project required.</p></div>
          <div className="steps">
            <div className="step"><h3>Create a team</h3><p>Name it after the project and choose a team picture, or upload a group photo.</p></div>
            <div className="step"><h3>Invite your people</h3><p>Enter their emails. They join with one click and appear in the team instantly.</p></div>
            <div className="step"><h3>Assign and track</h3><p>Add tasks, set urgency, request reviews and follow up, with the history kept for you.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="reports">
        <div className="lp-wrap">
          <div className="band">
            <div>
              <h2>Reports land in your inbox, automatically</h2>
              <p>Every Monday you get a weekly summary and on the 1st a monthly one: what was completed, what is overdue, what is waiting for review and who did what.</p>
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
          <div className="badge"><img src="/logo.png" alt="Tiger Logistics" /></div>
          <nav><a href="#features">Features</a><a href="#how">How it works</a><a href="#reports">Reports</a><a href="#faq">FAQ</a><Link href="/login">Sign in</Link></nav>
          <small>© {new Date().getFullYear()} Tiger Logistics. All rights reserved.</small>
        </div>
      </footer>
    </div>
  );
}

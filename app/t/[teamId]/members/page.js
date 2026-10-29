import SubmitButton from "@/components/SubmitButton";
import { getTeamCtx } from '@/lib/ctx';
import { siteUrl } from '@/lib/site';
import TeamAvatar from '@/components/TeamAvatar';
import AvatarPicker from '@/components/AvatarPicker';
import CopyLink from '@/components/CopyLink';
import { updateTeam, inviteMembers, removeMember, revokeInvite, sendReportNow, deleteTeam, rotateJoinLink, toggleJoinLink } from '../../../actions';

export default async function Members({ params, searchParams }) {
  const { teamId } = await params;
  const { msg } = await searchParams;
  const { sb, user, team, isManager } = await getTeamCtx(teamId);

  const { data: members } = await sb.from('tp_members').select('*').eq('team_id', team.id).order('created_at');
  const { data: invites } = isManager
    ? await sb.from('tp_invites').select('*').eq('team_id', team.id).is('accepted_at', null).order('created_at', { ascending: false })
    : { data: [] };
  const base = await siteUrl();
  const hidden = <input type="hidden" name="teamId" value={team.id} />;

  return (
    <>
      <header className="topbar">
        <div className="head-with-avatar">
          <TeamAvatar team={team} size={56} />
          <div><h1>{team.name}</h1><p className="sub">{team.description || 'Members & settings'}</p></div>
        </div>
      </header>
      {msg && <p className="notice">{msg}</p>}

      <div className="grid2">
        <div className="stack">
          <section className="panel">
            <h3>Members ({members?.length || 0})</h3>
            {(members || []).map((m) => (
              <div key={m.user_id} className="mini">
                <span className="av">{(m.name || m.email || '?')[0].toUpperCase()}</span>
                <span className="t">{m.name || m.email}<div className="sub">{m.email}</div></span>
                <span className={`tag ${m.role}`}>{m.role}</span>
                {isManager && m.user_id !== user.id && (
                  <form action={removeMember}>{hidden}<input type="hidden" name="userId" value={m.user_id} /><SubmitButton className="btn danger sm">Remove</SubmitButton></form>
                )}
              </div>
            ))}
          </section>

          {isManager && (
            <section className="panel">
              <h3>Pending invites</h3>
              {(invites || []).length === 0 && <p className="sub">None.</p>}
              {(invites || []).map((i) => (
                <div key={i.id} className="mini">
                  <span className="t">{i.email}<div className="sub link">{base}/join?token={i.token}</div></span>
                  <span className={`tag ${i.role}`}>{i.role}</span>
                  <form action={revokeInvite}>{hidden}<input type="hidden" name="id" value={i.id} /><SubmitButton className="btn sm">Revoke</SubmitButton></form>
                </div>
              ))}
            </section>
          )}
        </div>

        {isManager && (
          <div className="stack">
            <section id="invite-link" className="panel stack join-panel">
              <h3>Quick join link</h3>
              {team.join_token === undefined ? (
                <p className="sub">One-time setup: run <b>supabase/join-link.sql</b> in the Supabase SQL editor to switch this on.</p>
              ) : !team.join_token ? (
                <>
                  <p className="sub">Create a link anyone can open to make an account and join this team in one step.</p>
                  <form action={rotateJoinLink}>{hidden}<SubmitButton className="btn primary" pendingText="Creating…">Create invite link</SubmitButton></form>
                </>
              ) : (
                <>
                  <p className="sub">{team.join_enabled === false ? 'The link is switched off. Turn it on to let people join.' : 'Share this link. New people create an account and join in one step, no email needed.'}</p>
                  <CopyLink url={`${base}/j/${team.join_token}`} shareText={`Join ${team.name} on Stableworks:`} />
                  <div className="actions">
                    <form action={toggleJoinLink}>{hidden}<input type="hidden" name="enable" value={team.join_enabled === false ? '1' : '0'} />
                      <SubmitButton className="btn sm">{team.join_enabled === false ? 'Turn link on' : 'Turn link off'}</SubmitButton></form>
                    <form action={rotateJoinLink}>{hidden}<SubmitButton className="btn sm" pendingText="Replacing…">Replace link</SubmitButton></form>
                  </div>
                  <p className="sub">Anyone with the link can join as a member. Replace it if it is shared by mistake.</p>
                </>
              )}
            </section>

            <form action={inviteMembers} id="invite" className="panel stack">
              {hidden}
              <h3>Invite people</h3>
              <textarea name="emails" rows="3" placeholder="Emails, separated by commas or new lines" required />
              <label>Role
                <select name="role"><option value="member">Member</option><option value="manager">Manager</option></select>
              </label>
              <SubmitButton className="btn primary">Send invites</SubmitButton>
            </form>

            <form action={sendReportNow} className="panel stack">
              {hidden}
              <h3>Task reports</h3>
              <p className="sub">Reports go out automatically every Monday (weekly) and on the 1st (monthly). Team leads get the full team; everyone else gets their own tasks. Send one now:</p>
              <div className="actions">
                <SubmitButton name="kind" value="weekly" className="btn">Send weekly report</SubmitButton>
                <SubmitButton name="kind" value="monthly" className="btn">Send last month's report</SubmitButton>
              </div>
            </form>

            <form action={updateTeam} className="panel stack" encType="multipart/form-data">
              {hidden}
              <h3>Team settings</h3>
              <label>Name<input name="name" defaultValue={team.name} required /></label>
              <label>Description<input name="description" defaultValue={team.description || ''} /></label>
              <AvatarPicker current={team.avatar} />
              <SubmitButton className="btn">Save settings</SubmitButton>
            </form>

            <form action={deleteTeam} className="panel stack danger-zone">
              {hidden}
              <h3>Delete team</h3>
              <p className="sub">Permanently deletes this team, its members, all tasks and their history. This can't be undone.</p>
              <label>Type <b>{team.name}</b> to confirm<input name="confirm" autoComplete="off" required /></label>
              <SubmitButton className="btn danger">Delete team</SubmitButton>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

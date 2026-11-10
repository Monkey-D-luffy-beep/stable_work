import Link from 'next/link';
import { getUser, getMyTeams } from '@/lib/ctx';
import { defaultAvatar } from '@/lib/avatars';
import Avatar from '@/components/Avatar';
import AvatarChooser from '@/components/AvatarChooser';
import SubmitButton from '@/components/SubmitButton';
import InstallButton from '@/components/InstallButton';
import { updateProfile, changePassword } from '../actions';

export const metadata = { title: 'Your profile · Stableworks' };

export default async function Profile({ searchParams }) {
  const { msg, err } = await searchParams;
  const { user } = await getUser();
  const teams = await getMyTeams();
  const name = user.user_metadata?.full_name || teams[0]?.name || user.email.split('@')[0];
  const avatar = user.user_metadata?.avatar || teams.find((t) => t.avatar)?.avatar || '';

  return (
    <main className="wrap narrow">
      <Link href={teams[0] ? `/t/${teams[0].team.id}` : '/'} className="sub">← Back</Link>
      <h1>Your profile</h1>
      <p className="sub">Your name and picture show up on tasks and in every team you belong to.</p>
      {msg && <p className="notice">{msg}</p>}
      {err && <p className="error">{err}</p>}
      <form action={updateProfile} className="panel stack">
        <div className="profile-head">
          <Avatar src={avatar || defaultAvatar(user.email)} name={name} size={72} />
          <div><b>{name}</b><div className="sub">{user.email}</div></div>
        </div>
        <label>Name<input name="name" defaultValue={name} required /></label>
        <label>Profile picture</label>
        <AvatarChooser defaultValue={avatar} />
        <SubmitButton className="btn primary" pendingText="Saving…">Save profile</SubmitButton>
      </form>

      <form action={changePassword} className="panel stack">
        <h3>Change password</h3>
        <label>New password<input type="password" name="password" minLength={8} autoComplete="new-password" required /></label>
        <label>Confirm new password<input type="password" name="confirm" minLength={8} autoComplete="new-password" required /></label>
        <SubmitButton className="btn" pendingText="Changing…">Change password</SubmitButton>
      </form>

      <section className="panel stack">
        <h3>Use it on your phone</h3>
        <p className="sub">iPhone: open this site in Safari, tap Share, then “Add to Home Screen”.</p>
        <p className="sub">Android / desktop Chrome: tap the button below.</p>
        <InstallButton className="btn" />
      </section>
    </main>
  );
}

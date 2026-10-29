import Link from 'next/link';
import { getUser, getMyTeams } from '@/lib/ctx';
import { defaultAvatar } from '@/lib/avatars';
import Avatar from '@/components/Avatar';
import AvatarChooser from '@/components/AvatarChooser';
import SubmitButton from '@/components/SubmitButton';
import { updateProfile } from '../actions';

export const metadata = { title: 'Your profile · Stableworks' };

export default async function Profile({ searchParams }) {
  const { msg } = await searchParams;
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
    </main>
  );
}

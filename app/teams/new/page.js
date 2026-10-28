import Link from 'next/link';
import { getUser } from '@/lib/ctx';
import AvatarPicker from '@/components/AvatarPicker';
import { createTeam } from '../../actions';

export default async function NewTeam({ searchParams }) {
  const { error } = await searchParams;
  await getUser();
  return (
    <main className="wrap narrow">
      <Link href="/" className="sub">← Your teams</Link>
      <h1>Create a team</h1>
      <p className="sub">One team per project. You'll be its manager and can invite people next.</p>
      {error && <p className="error">{error}</p>}
      <form action={createTeam} className="panel stack">
        <label>Team name<input name="name" placeholder="e.g. Warehouse Rollout" required autoFocus /></label>
        <label>Description <span className="sub">(optional)</span><input name="description" /></label>
        <AvatarPicker />
        <button className="btn primary">Create team</button>
      </form>
    </main>
  );
}

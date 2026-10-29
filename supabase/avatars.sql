-- Profile pictures. Run once in the Supabase SQL editor. Safe to re-run.
alter table tp_members add column if not exists avatar text;
notify pgrst, 'reload schema';

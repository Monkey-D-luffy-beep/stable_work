-- Quick join link per team. Run once in the Supabase SQL editor. Safe to re-run.
-- Gives every team a shareable link (/j/<token>) that lets new people create an account and join in one step.

alter table tp_teams add column if not exists join_token text;
alter table tp_teams add column if not exists join_enabled boolean not null default true;

-- Existing teams get a link straight away.
update tp_teams set join_token = encode(gen_random_bytes(9), 'hex') where join_token is null;

create unique index if not exists tp_teams_join_token_key on tp_teams(join_token);

notify pgrst, 'reload schema';

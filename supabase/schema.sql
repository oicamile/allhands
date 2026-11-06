-- All Hands · Votação. Rode inteiro no SQL Editor do Supabase.
-- Modelo de acesso:
--   * Votante (anon): só chama as funções voter_state e cast_vote. Não lê nenhuma tabela,
--     então não consegue ver votos antes da revelação.
--   * Equipe (authenticated + está na tabela team): lê e escreve sessões e histórias via RLS,
--     e lê as contagens por admin_tallies / admin_overview.
--   * Os votos só são lidos por funções security definer.

create extension if not exists pg_cron;

create table if not exists team (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('admin', 'moderador'))
);

create table if not exists joke_library (
  id text primary key,
  name text not null,
  emoji text not null,
  meaning text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  code text primary key,
  date date not null,
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  weight numeric not null default 0.5 check (weight >= 0 and weight <= 1),
  cur_index int not null default 0,
  jokes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  last_activity timestamptz not null default now()
);

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  session_code text not null references sessions(code) on delete cascade,
  position int not null default 0,
  name text not null default '',
  area text not null default '',
  body text not null default '',
  status text not null default 'waiting' check (status in ('waiting', 'voting', 'closed', 'revealed'))
);
create index if not exists stories_session_idx on stories(session_code, position);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  voter text not null check (char_length(voter) between 8 and 64),
  grade text not null,
  is_author boolean not null default false,
  ts timestamptz not null default now(),
  unique (story_id, voter)
);

-- equipe inicial
insert into team (email, role) values ('camile@oicamile.cc', 'admin') on conflict do nothing;
delete from joke_library where id = 'ressalvamento';
insert into joke_library (id, name, emoji, meaning) values
  ('pesar', 'Nota de pesar', '🕯️', ''),
  ('repudio', 'Nota de repúdio', '🚫', ''),
  ('do', 'Nota dó', '🥺', ''),
  ('ressarcimento', 'Nota de ressarcimento', '💸', '')
on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, meaning = excluded.meaning;

-- ---------- helpers de papel ----------
create or replace function is_team() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team where email = lower(auth.jwt() ->> 'email'));
$$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team where email = lower(auth.jwt() ->> 'email') and role = 'admin');
$$;

-- ---------- RLS ----------
alter table team enable row level security;
alter table joke_library enable row level security;
alter table sessions enable row level security;
alter table stories enable row level security;
alter table votes enable row level security; -- sem policy: ninguém lê direto

drop policy if exists team_read on team;
create policy team_read on team for select to authenticated using (is_team());
drop policy if exists team_write on team;
create policy team_write on team for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists jokes_all on joke_library;
create policy jokes_all on joke_library for all to authenticated using (is_team()) with check (is_team());

drop policy if exists sessions_all on sessions;
create policy sessions_all on sessions for all to authenticated using (is_team()) with check (is_team());

drop policy if exists stories_all on stories;
create policy stories_all on stories for all to authenticated using (is_team()) with check (is_team());

-- ---------- apuração (média ponderada: autor pesa `weight`, notas piada ficam de fora) ----------
create or replace function tally_json(p_story uuid, p_weight numeric) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'counted', count(*) filter (where grade ~ '^[1-5]$'),
    'nums', jsonb_build_array(
      count(*) filter (where grade = '1'), count(*) filter (where grade = '2'), count(*) filter (where grade = '3'),
      count(*) filter (where grade = '4'), count(*) filter (where grade = '5')),
    'avg', case
      when coalesce(sum(case when grade ~ '^[1-5]$' then case when is_author then p_weight else 1 end end), 0) > 0
      then sum(case when grade ~ '^[1-5]$' then grade::int * (case when is_author then p_weight else 1 end) end)
           / sum(case when grade ~ '^[1-5]$' then case when is_author then p_weight else 1 end end)
      else null end,
    'jokes', coalesce((
      select jsonb_object_agg(g, c)
      from (select grade g, count(*) c from votes where story_id = p_story and grade !~ '^[1-5]$' group by grade) j
    ), '{}'::jsonb)
  )
  from votes where story_id = p_story;
$$;

-- ---------- funções do votante (anon) ----------
create or replace function voter_state(p_code text, p_voter text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sessions; st stories; total int; my record; story jsonb := null; tally jsonb := null; mine jsonb := null;
begin
  select * into s from sessions where code = upper(p_code);
  if not found then return null; end if;
  select count(*) into total from stories where session_code = s.code;
  select * into st from stories where session_code = s.code order by position, id offset s.cur_index limit 1;
  if found then
    story := jsonb_build_object('id', st.id, 'status', st.status, 'index', s.cur_index, 'total', total);
    if st.status <> 'waiting' then
      story := story || jsonb_build_object('name', st.name, 'area', st.area, 'text', st.body);
    end if;
    select grade, is_author into my from votes where story_id = st.id and voter = p_voter;
    if found then mine := jsonb_build_object('grade', my.grade, 'is_author', my.is_author); end if;
  end if;
  return jsonb_build_object(
    'status', s.status, 'weight', s.weight,
    'jokes', (select coalesce(jsonb_agg(j), '[]'::jsonb) from jsonb_array_elements(s.jokes) j where (j ->> 'active')::boolean),
    'story', story, 'my_vote', mine); -- voto secreto: votante nunca recebe apuração
end $$;

create or replace function cast_vote(p_code text, p_story uuid, p_voter text, p_grade text, p_is_author boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions; cur uuid; st_status text;
begin
  select * into s from sessions where code = upper(p_code);
  if not found then raise exception 'sessao nao existe'; end if;
  select id, status into cur, st_status from stories where session_code = s.code order by position, id offset s.cur_index limit 1;
  if cur is distinct from p_story or st_status <> 'voting' then return; end if; -- votação fechada: ignora
  if p_grade !~ '^[1-5]$' and not exists (
    select 1 from jsonb_array_elements(s.jokes) j where j ->> 'id' = p_grade and (j ->> 'active')::boolean
  ) then raise exception 'nota invalida'; end if;
  insert into votes (story_id, voter, grade, is_author) values (p_story, p_voter, p_grade, coalesce(p_is_author, false))
  on conflict (story_id, voter) do update set grade = excluded.grade, is_author = excluded.is_author, ts = now();
  update sessions set last_activity = now() where code = s.code and last_activity < now() - interval '30 seconds';
end $$;

grant execute on function voter_state(text, text) to anon, authenticated;
grant execute on function cast_vote(text, uuid, text, text, boolean) to anon, authenticated;

-- ---------- funções da equipe ----------
create or replace function admin_tallies(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sessions; out jsonb := '{}'::jsonb; r record;
begin
  if not is_team() then raise exception 'sem acesso'; end if;
  select * into s from sessions where code = p_code;
  if not found then return out; end if;
  for r in select id from stories where session_code = s.code loop
    out := out || jsonb_build_object(r.id::text, tally_json(r.id, s.weight));
  end loop;
  return out;
end $$;

create or replace function admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_team() then raise exception 'sem acesso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', s.code, 'date', s.date, 'status', s.status,
      'created_at', s.created_at, 'ended_at', s.ended_at, 'last_activity', s.last_activity,
      'stories', (select count(*) from stories t where t.session_code = s.code),
      'votes', (select count(*) from votes v join stories t on t.id = v.story_id where t.session_code = s.code)
    ) order by s.created_at desc) from sessions s), '[]'::jsonb);
end $$;

revoke execute on function admin_tallies(text) from public, anon;
revoke execute on function admin_overview() from public, anon;
grant execute on function admin_tallies(text) to authenticated;
grant execute on function admin_overview() to authenticated;

-- ---------- expiração: 12h depois do encerramento (ou do último movimento, se ninguém encerrar) ----------
select cron.unschedule('allhands-purge') where exists (select 1 from cron.job where jobname = 'allhands-purge');
select cron.schedule('allhands-purge', '*/15 * * * *',
  $$delete from sessions where coalesce(ended_at, last_activity) < now() - interval '12 hours'$$);


create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Kyoka',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Kyoka'))
  on conflict do nothing;
  insert into public.studio_sessions (owner_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  text text not null,
  gimmick text not null,
  category text not null default 'Random Thoughts',
  favorite boolean not null default false,
  used boolean not null default false,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.questions to authenticated;
grant all on public.questions to service_role;
alter table public.questions enable row level security;
create policy "own questions" on public.questions for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create index on public.questions (owner_id, gimmick);

create table public.studio_sessions (
  owner_id uuid primary key,
  overlay_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  audience_code text not null unique default lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  overlay_state jsonb not null default '{}'::jsonb,
  audience_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.studio_sessions to authenticated;
grant all on public.studio_sessions to service_role;
alter table public.studio_sessions enable row level security;
create policy "own session" on public.studio_sessions for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.audience_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null,
  round_id text,
  choice text,
  content text,
  nickname text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
grant select, update, delete on public.audience_submissions to authenticated;
grant all on public.audience_submissions to service_role;
alter table public.audience_submissions enable row level security;
create policy "owner reads submissions" on public.audience_submissions for select to authenticated using (auth.uid() = owner_id);
create policy "owner updates submissions" on public.audience_submissions for update to authenticated using (auth.uid() = owner_id);
create policy "owner deletes submissions" on public.audience_submissions for delete to authenticated using (auth.uid() = owner_id);
create index on public.audience_submissions (owner_id, created_at desc);
alter publication supabase_realtime add table public.audience_submissions;

-- Public, minimal read for the overlay (by secret token)
create or replace function public.get_overlay_state(_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select overlay_state from public.studio_sessions where overlay_token = _token
$$;
-- Public, minimal read for the audience page (by code)
create or replace function public.get_audience_state(_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select audience_state from public.studio_sessions where audience_code = lower(_code)
$$;
-- Anonymous audience submission with validation + light rate limit
create or replace function public.submit_audience(_code text, _kind text, _round text, _choice text, _content text, _nickname text)
returns boolean language plpgsql security definer set search_path = public as $$
declare _owner uuid; _recent int;
begin
  select owner_id into _owner from public.studio_sessions where audience_code = lower(_code);
  if _owner is null then raise exception 'Sesi tidak ditemukan'; end if;
  if _kind not in ('vote','confession','problem','question') then raise exception 'Jenis tidak valid'; end if;
  if coalesce(length(_content),0) > 280 or coalesce(length(_nickname),0) > 30 or coalesce(length(_choice),0) > 10 or coalesce(length(_round),0) > 40 then
    raise exception 'Terlalu panjang'; end if;
  if _kind <> 'vote' and coalesce(length(trim(_content)),0) < 3 then raise exception 'Isi terlalu pendek'; end if;
  select count(*) into _recent from public.audience_submissions where owner_id = _owner and created_at > now() - interval '10 seconds';
  if _recent > 200 then raise exception 'Lagi ramai, coba lagi sebentar'; end if;
  insert into public.audience_submissions (owner_id, kind, round_id, choice, content, nickname, status)
  values (_owner, _kind, _round, _choice, nullif(trim(_content),''), nullif(trim(_nickname),''), case when _kind = 'vote' then 'counted' else 'pending' end);
  return true;
end $$;
revoke all on function public.get_overlay_state(text) from public;
revoke all on function public.get_audience_state(text) from public;
revoke all on function public.submit_audience(text,text,text,text,text,text) from public;
grant execute on function public.get_overlay_state(text) to anon, authenticated;
grant execute on function public.get_audience_state(text) to anon, authenticated;
grant execute on function public.submit_audience(text,text,text,text,text,text) to anon, authenticated;

create or replace function public.rotate_overlay_token() returns text
language plpgsql security definer set search_path = public as $$
declare t text := encode(gen_random_bytes(18), 'hex');
begin
  update public.studio_sessions set overlay_token = t where owner_id = auth.uid();
  return t;
end $$;
revoke all on function public.rotate_overlay_token() from public;
grant execute on function public.rotate_overlay_token() to authenticated;

create table if not exists public.opencode_sessions (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null unique,
  active_turn_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opencode_sessions_owner_idx on public.opencode_sessions(owner_id);
alter table public.opencode_sessions enable row level security;
grant select on public.opencode_sessions to authenticated;
drop policy if exists "Users read their OpenCode sessions" on public.opencode_sessions;
create policy "Users read their OpenCode sessions" on public.opencode_sessions
  for select to authenticated using ((select auth.uid()) = owner_id);

create table if not exists public.assistant_turns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_message_id uuid not null unique references public.messages(id) on delete cascade,
  assistant_message_id uuid references public.messages(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  response jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_turns_owner_recent_idx on public.assistant_turns(owner_id, created_at desc);
create index if not exists assistant_turns_conversation_idx on public.assistant_turns(conversation_id, created_at);
create unique index if not exists assistant_turns_one_running_per_conversation_idx on public.assistant_turns(conversation_id) where status = 'running';
alter table public.assistant_turns enable row level security;
grant select on public.assistant_turns to authenticated;
drop policy if exists "Users read their assistant turns" on public.assistant_turns;
create policy "Users read their assistant turns" on public.assistant_turns
  for select to authenticated using ((select auth.uid()) = owner_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'opencode_sessions_active_turn_fk'
      and conrelid = 'public.opencode_sessions'::regclass
  ) then
    alter table public.opencode_sessions
      add constraint opencode_sessions_active_turn_fk foreign key (active_turn_id)
      references public.assistant_turns(id) on delete set null;
  end if;
end $$;

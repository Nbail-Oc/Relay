create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

create policy "Users read their conversations" on public.conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their conversations" on public.conversations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their conversations" on public.conversations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their conversations" on public.conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read messages in their conversations" on public.messages
  for select to authenticated using (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
  ));
create policy "Users add messages to their conversations" on public.messages
  for insert to authenticated with check (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
  ));
create policy "Users update messages in their conversations" on public.messages
  for update to authenticated using (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
  ));
create policy "Users delete messages in their conversations" on public.messages
  for delete to authenticated using (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
  ));

alter table public.conversations
  add column if not exists mode text not null default 'general'
    check (mode in ('general', 'invoice', 'shopping', 'refund')),
  add column if not exists workflow_state jsonb not null default '{}'::jsonb;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('text/plain', 'text/markdown', 'text/x-markdown')),
  size_bytes integer not null check (size_bytes between 1 and 1048576),
  created_at timestamptz not null default now()
);

create index attachments_conversation_created_idx on public.attachments(conversation_id, created_at);
alter table public.attachments enable row level security;
grant select on public.attachments to authenticated;
create policy "Users read their attachments" on public.attachments
  for select to authenticated using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-attachments', 'voice-attachments', false, 1048576,
  array['text/plain', 'text/markdown', 'text/x-markdown'])
on conflict (id) do update set public = false, file_size_limit = 1048576,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users read own voice attachments" on storage.objects
  for select to authenticated using (
    bucket_id = 'voice-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users upload own voice attachments" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'voice-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users delete own voice attachments" on storage.objects
  for delete to authenticated using (
    bucket_id = 'voice-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create table public.paypal_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  parent_action_id uuid references public.paypal_actions(id),
  kind text not null check (kind in ('invoice_draft', 'invoice_send', 'order_create', 'order_capture', 'refund')),
  status text not null check (status in ('draft_created', 'awaiting_approval', 'approved', 'pending_confirmation', 'executing', 'reconciliation_required', 'succeeded', 'failed', 'cancelled')),
  currency text not null default 'USD' check (currency = 'USD'),
  amount numeric(12,2) check (amount is null or amount > 0),
  recipient text,
  paypal_resource_id text,
  capture_id text,
  idempotency_key uuid not null unique,
  confirmation_token_hash text,
  confirmation_expires_at timestamptz,
  confirmed_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index paypal_actions_owner_recent_idx on public.paypal_actions(owner_id, created_at desc);
create index paypal_actions_conversation_idx on public.paypal_actions(conversation_id, created_at);
create unique index paypal_actions_single_pending_confirmation_idx
  on public.paypal_actions(conversation_id) where status = 'pending_confirmation';
alter table public.paypal_actions enable row level security;
grant select on public.paypal_actions to authenticated;
create policy "Users read their PayPal actions" on public.paypal_actions
  for select to authenticated using ((select auth.uid()) = owner_id);

create table public.paypal_action_events (
  id bigint generated always as identity primary key,
  action_id uuid not null references public.paypal_actions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('prepared', 'approved', 'confirmation_requested', 'confirmation_accepted', 'executing', 'succeeded', 'failed', 'cancelled', 'reconciled')),
  summary text not null check (char_length(summary) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index paypal_action_events_action_idx on public.paypal_action_events(action_id, created_at);
alter table public.paypal_action_events enable row level security;
grant select on public.paypal_action_events to authenticated;
create policy "Users read their PayPal action events" on public.paypal_action_events
  for select to authenticated using ((select auth.uid()) = owner_id);

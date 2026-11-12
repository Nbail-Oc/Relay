begin;

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'rls-a@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'rls-b@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.conversations (id, user_id, title) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'User A chat'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'User B chat');
insert into public.messages (conversation_id, role, content) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user', 'A message'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'user', 'B message');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.conversations;
  if visible_count <> 1 then raise exception 'User A should see one conversation, saw %', visible_count; end if;
  select count(*) into visible_count from public.messages;
  if visible_count <> 1 then raise exception 'User A should see one message, saw %', visible_count; end if;
  begin
    insert into public.messages (conversation_id, role, content) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'user', 'forbidden');
    raise exception 'User A inserted into User B conversation';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.conversations;
  if visible_count <> 1 then raise exception 'User B should see one conversation, saw %', visible_count; end if;
  select count(*) into visible_count from public.messages;
  if visible_count <> 1 then raise exception 'User B should see one message, saw %', visible_count; end if;
end $$;

rollback;

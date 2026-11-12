create index if not exists attachments_owner_id_idx on public.attachments(owner_id);
create index if not exists paypal_actions_parent_action_id_idx on public.paypal_actions(parent_action_id);
create index if not exists paypal_action_events_owner_id_idx on public.paypal_action_events(owner_id);

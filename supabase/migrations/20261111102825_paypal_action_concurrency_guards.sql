create unique index if not exists paypal_actions_one_open_order_per_conversation_idx
  on public.paypal_actions(conversation_id)
  where kind = 'order_create' and status in ('executing', 'reconciliation_required', 'awaiting_approval', 'approved');

create unique index if not exists paypal_actions_one_unresolved_refund_per_capture_idx
  on public.paypal_actions(capture_id)
  where kind = 'refund' and status in ('pending_confirmation', 'executing', 'reconciliation_required');

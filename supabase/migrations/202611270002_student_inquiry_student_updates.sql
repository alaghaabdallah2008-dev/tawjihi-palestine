-- Allow a student to update only their own conversation summary fields.
-- The browser client still cannot create admin messages; the messages insert policy
-- only permits sender_role = 'student'.

grant select, insert, update on public.inquiry_conversations to authenticated;
grant select, insert on public.inquiry_messages to authenticated;

drop policy if exists "Students update own inquiry conversations" on public.inquiry_conversations;
create policy "Students update own inquiry conversations"
on public.inquiry_conversations for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

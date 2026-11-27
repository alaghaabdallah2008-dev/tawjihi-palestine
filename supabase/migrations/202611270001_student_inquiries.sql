-- Student inquiries and shared admin inbox
-- Run this script once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.inquiry_conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null default 'طالب',
  student_avatar text,
  subject text not null default 'استفسار جديد',
  status text not null default 'open' check (status in ('open','closed')),
  last_message text,
  last_message_at timestamptz not null default now(),
  unread_by_admin boolean not null default true,
  unread_by_student boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inquiry_conversations_student_idx
  on public.inquiry_conversations(student_id, last_message_at desc);
create index if not exists inquiry_conversations_recent_idx
  on public.inquiry_conversations(last_message_at desc);

create table if not exists public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.inquiry_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('student','admin')),
  sender_name text not null,
  body text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  constraint inquiry_message_has_content check (
    length(trim(body)) > 0 or attachment_path is not null
  ),
  constraint inquiry_student_sender_required check (
    sender_role <> 'student' or sender_id is not null
  )
);

create index if not exists inquiry_messages_conversation_idx
  on public.inquiry_messages(conversation_id, created_at);

alter table public.inquiry_conversations enable row level security;
alter table public.inquiry_messages enable row level security;

drop policy if exists "Students read own inquiry conversations" on public.inquiry_conversations;
create policy "Students read own inquiry conversations"
on public.inquiry_conversations for select to authenticated
using (student_id = auth.uid());

drop policy if exists "Students create own inquiry conversations" on public.inquiry_conversations;
create policy "Students create own inquiry conversations"
on public.inquiry_conversations for insert to authenticated
with check (student_id = auth.uid());

drop policy if exists "Students read messages in own conversations" on public.inquiry_messages;
create policy "Students read messages in own conversations"
on public.inquiry_messages for select to authenticated
using (
  exists (
    select 1 from public.inquiry_conversations c
    where c.id = conversation_id and c.student_id = auth.uid()
  )
);

drop policy if exists "Students send messages in own conversations" on public.inquiry_messages;
create policy "Students send messages in own conversations"
on public.inquiry_messages for insert to authenticated
with check (
  sender_role = 'student'
  and sender_id = auth.uid()
  and exists (
    select 1 from public.inquiry_conversations c
    where c.id = conversation_id and c.student_id = auth.uid()
  )
);

-- Keep attachments private. Files are stored under: <student-user-id>/<conversation-id>/<filename>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inquiry-attachments',
  'inquiry-attachments',
  false,
  10485760,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students upload own inquiry attachments" on storage.objects;
create policy "Students upload own inquiry attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inquiry-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Students read own inquiry attachments" on storage.objects;
create policy "Students read own inquiry attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'inquiry-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Enable Realtime for live conversation updates, without duplicating publication entries.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inquiry_conversations'
  ) then
    alter publication supabase_realtime add table public.inquiry_conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inquiry_messages'
  ) then
    alter publication supabase_realtime add table public.inquiry_messages;
  end if;
end $$;

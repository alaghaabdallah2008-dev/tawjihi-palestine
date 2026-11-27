-- Student inquiries: private conversations and messages
create extension if not exists pgcrypto;

create table if not exists public.inquiry_conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null default 'طالب',
  student_avatar text not null default '',
  subject text not null check (char_length(subject) between 1 and 120),
  status text not null default 'open' check (status in ('open','closed')),
  student_unread boolean not null default false,
  admin_unread boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.inquiry_conversations(id) on delete cascade,
  sender_id uuid null references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('student','admin')),
  body text not null default '' check (char_length(body) <= 10000),
  attachment_path text null,
  attachment_name text null,
  attachment_mime text null,
  attachment_size bigint null,
  created_at timestamptz not null default now(),
  constraint inquiry_message_has_content check (length(trim(body)) > 0 or attachment_path is not null)
);

create index if not exists inquiry_conversations_student_updated_idx
  on public.inquiry_conversations(student_id, updated_at desc);
create index if not exists inquiry_messages_conversation_created_idx
  on public.inquiry_messages(conversation_id, created_at);

alter table public.inquiry_conversations enable row level security;
alter table public.inquiry_messages enable row level security;

drop policy if exists "students read own inquiry conversations" on public.inquiry_conversations;
create policy "students read own inquiry conversations"
  on public.inquiry_conversations for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "students read messages in own conversations" on public.inquiry_messages;
create policy "students read messages in own conversations"
  on public.inquiry_messages for select to authenticated
  using (exists (
    select 1 from public.inquiry_conversations c
    where c.id = conversation_id and c.student_id = auth.uid()
  ));

grant select on public.inquiry_conversations, public.inquiry_messages to authenticated;
revoke insert, update, delete on public.inquiry_conversations, public.inquiry_messages from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inquiry-attachments','inquiry-attachments',false,5242880,
  array[
    'image/jpeg','image/png','image/webp','application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'
  ]
)
on conflict (id) do update set
  public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- No client-side storage policies: signed URLs are issued by server APIs only.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='inquiry_messages'
  ) then
    alter publication supabase_realtime add table public.inquiry_messages;
  end if;
end $$;

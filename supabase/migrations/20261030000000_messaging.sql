-- Messaging: one-to-one and group chats between every role.
--
-- Who may start a chat with whom (private.can_message):
--   super_admin      anyone
--   other staff      all staff, and tenant accounts whose tenancy they can see (their properties)
--   tenant           the staff who look after their home: super admins, accountants, and the managers and
--                    caretakers of their property. Tenants never see or message other tenants.
-- Once a conversation exists, its members keep talking in it. Group chats are created by staff.
--
-- Tenants may not read staff profiles (phone, email), so the chat list and the contact picker come from
-- security definer functions that return names and roles only, for people the caller shares a chat with
-- or may message.
--
-- New messages reach phones through the same Expo push service as notifications (see
-- 20261023000000_push_notifications.sql), without adding rows to the notification feed.

-- ---------------------------------------------------------------- tables
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text not null default '',
  direct_key text unique,                -- 'smaller-uuid:larger-uuid', so two people share one direct chat
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((kind = 'direct') = (direct_key is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index on public.conversation_members (profile_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(), -- the app picks it, so its own copy and the live copy match
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null,
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (deleted_at is not null or char_length(btrim(body)) between 1 and 4000)
);
create index on public.messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------- helpers
create function private.is_member(conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members m where m.conversation_id = conv and m.profile_id = auth.uid())
    and private.my_role() is not null -- suspended accounts are locked out
$$;

create function private.can_message(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select target is distinct from auth.uid() and exists (
    select 1 from public.profiles p
    where p.id = target and p.status <> 'suspended' and (
      private.is_admin()
      or (private.is_staff() and (
            p.role <> 'tenant'
            or exists (select 1 from public.tenants t where t.id = p.tenant_id and private.can_see_property(t.property_id))))
      or (private.my_role() = 'tenant' and p.role <> 'tenant' and (
            p.role in ('super_admin', 'accountant')
            or p.id = (select pr.manager_id from public.properties pr where pr.id = private.my_property_id())
            or exists (select 1 from public.profile_properties pp
                       where pp.profile_id = p.id and pp.property_id = private.my_property_id())))
    )
  )
$$;

grant execute on function private.is_member(uuid), private.can_message(uuid) to authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "conversations: members read" on public.conversations for select to authenticated
  using (private.is_member(id));
create policy "conversation_members: members read" on public.conversation_members for select to authenticated
  using (private.is_member(conversation_id));
create policy "messages: members read" on public.messages for select to authenticated
  using (private.is_member(conversation_id));
create policy "messages: members send as themselves" on public.messages for insert to authenticated
  with check (private.is_member(conversation_id) and sender_id = auth.uid());
-- No other write policies: chats, members, read receipts and deletes go through the functions below.

-- The server stamps the time, clears any deletion, bumps the chat to the top and marks it read for the sender.
create function private.stamp_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  new.deleted_at := null;
  new.body := btrim(new.body);
  if new.reply_to is not null and not exists (
    select 1 from public.messages r where r.id = new.reply_to and r.conversation_id = new.conversation_id) then
    new.reply_to := null;
  end if;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_members set last_read_at = new.created_at
    where conversation_id = new.conversation_id and profile_id = new.sender_id;
  return new;
end $$;
create trigger messages_stamp before insert on public.messages
  for each row execute function private.stamp_message();

-- ---------------------------------------------------------------- functions the app calls
/** Everyone the caller may start a chat with. */
create function public.chat_contacts()
returns table (id uuid, name text, role public.app_role, detail text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.role,
         case when p.role = 'tenant' then coalesce(pr.short || ' · ' || u.code, pr.short, '') else '' end
  from public.profiles p
  left join public.tenants t on t.id = p.tenant_id
  left join public.properties pr on pr.id = t.property_id
  left join public.units u on u.id = t.unit_id
  where private.can_message(p.id)
  order by p.role <> 'tenant' desc, p.name
$$;

/** The caller's chats, newest first, with members, the last message and the unread count. */
create function public.my_conversations()
returns table (id uuid, kind text, title text, created_by uuid, last_message_at timestamptz, members jsonb, last_message jsonb, unread int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.title, c.created_by, c.last_message_at,
         (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role, 'lastReadAt', m2.last_read_at) order by p.name)
            from public.conversation_members m2 join public.profiles p on p.id = m2.profile_id
            where m2.conversation_id = c.id),
         (select jsonb_build_object('id', x.id, 'senderId', x.sender_id, 'body', x.body, 'createdAt', x.created_at, 'deletedAt', x.deleted_at)
            from public.messages x where x.conversation_id = c.id order by x.created_at desc limit 1),
         (select count(*)::int from public.messages x
            where x.conversation_id = c.id and x.created_at > me.last_read_at
              and x.sender_id is distinct from auth.uid() and x.deleted_at is null)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  where me.profile_id = auth.uid() and private.my_role() is not null
  order by c.last_message_at desc
$$;

/** Opens the one-to-one chat with `other`, creating it the first time. */
create function public.start_direct_chat(other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  conv uuid;
begin
  if private.my_role() is null then raise exception 'Sign in first'; end if;
  k := least(auth.uid()::text, other::text) || ':' || greatest(auth.uid()::text, other::text);
  select c.id into conv from public.conversations c where c.direct_key = k;
  if conv is not null then
    if private.is_member(conv) then return conv; end if;
    raise exception 'You can’t message this person';
  end if;
  if not private.can_message(other) then raise exception 'You can’t message this person'; end if;
  insert into public.conversations (kind, direct_key, created_by) values ('direct', k, auth.uid()) returning id into conv;
  insert into public.conversation_members (conversation_id, profile_id) values (conv, auth.uid()), (conv, other);
  return conv;
end $$;

/** A named group chat with the caller and `people`. Staff only. */
create function public.create_group_chat(p_title text, people uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  conv uuid;
  person uuid;
begin
  if not private.is_staff() then raise exception 'Only staff can create group chats'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then raise exception 'Give the group a name (up to 80 characters)'; end if;
  if coalesce(array_length(people, 1), 0) = 0 then raise exception 'Add at least one person'; end if;
  foreach person in array people loop
    if not private.can_message(person) then raise exception 'You can’t add one of these people'; end if;
  end loop;
  insert into public.conversations (kind, title, created_by) values ('group', btrim(p_title), auth.uid()) returning id into conv;
  insert into public.conversation_members (conversation_id, profile_id)
    select conv, x from unnest(array_append(people, auth.uid())) as x
    on conflict do nothing;
  return conv;
end $$;

/** Marks everything in a chat as read by the caller (shows as blue ticks to the others). */
create function public.mark_conversation_read(conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = conv and profile_id = auth.uid() and private.my_role() is not null
$$;

/** Deletes one of the caller's own messages for everyone; the chat shows "This message was deleted". */
create function public.delete_message(msg uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages set body = '', deleted_at = now()
  where id = msg and sender_id = auth.uid() and deleted_at is null and private.is_member(conversation_id);
  if not found then raise exception 'You can only delete your own messages'; end if;
end $$;

/** Leaves a group chat. */
create function public.leave_group_chat(conv uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.conversation_members m
  using public.conversations c
  where m.conversation_id = conv and m.profile_id = auth.uid() and c.id = conv and c.kind = 'group'
$$;

revoke execute on function public.chat_contacts(), public.my_conversations(), public.start_direct_chat(uuid),
  public.create_group_chat(text, uuid[]), public.mark_conversation_read(uuid), public.delete_message(uuid),
  public.leave_group_chat(uuid) from public, anon;
grant execute on function public.chat_contacts(), public.my_conversations(), public.start_direct_chat(uuid),
  public.create_group_chat(text, uuid[]), public.mark_conversation_read(uuid), public.delete_message(uuid),
  public.leave_group_chat(uuid) to authenticated;

-- ---------------------------------------------------------------- push to the other members' phones
create function private.push_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  batch record;
  req bigint;
  sender text;
  conv public.conversations;
begin
  select name into sender from public.profiles where id = new.sender_id;
  select * into conv from public.conversations where id = new.conversation_id;
  for batch in
    select array_agg(t.token order by t.token) as tokens,
           jsonb_agg(jsonb_build_object(
             'to', t.token,
             'title', left(case when conv.kind = 'group' then coalesce(sender, 'Someone') || ' · ' || conv.title else coalesce(sender, 'New message') end, 120),
             'body', left(new.body, 240),
             'sound', 'default',
             'channelId', 'default',
             'data', jsonb_build_object('link', jsonb_build_object('name', 'messages', 'params', jsonb_build_object('id', new.conversation_id)))
           ) order by t.token) as messages
    from (
      select pt.token, (row_number() over (order by pt.token) - 1) / 100 as chunk
      from public.push_tokens pt
      join public.conversation_members m on m.profile_id = pt.user_id
      where m.conversation_id = new.conversation_id and m.profile_id is distinct from new.sender_id
    ) t
    group by t.chunk
  loop
    begin
      select net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := batch.messages,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
      ) into req;
      insert into private.push_sends (request_id, tokens) values (req, batch.tokens);
    exception when others then
      raise warning 'push for message % not sent: %', new.id, sqlerrm;
    end;
  end loop;
  return new;
end $$;

create trigger messages_push after insert on public.messages
  for each row execute function private.push_message();

-- ---------------------------------------------------------------- live updates
alter publication supabase_realtime add table public.messages, public.conversation_members, public.conversations;

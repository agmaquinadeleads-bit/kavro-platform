begin;

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and char_length(email) <= 254),
  role public.organization_role not null default 'member' check (role <> 'owner'),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (accepted_at is null or cancelled_at is null)
);

create unique index organization_invitations_pending_email_idx
on public.organization_invitations (org_id, email)
where accepted_at is null and cancelled_at is null;

create index organization_invitations_org_created_idx on public.organization_invitations (org_id, created_at desc);
alter table public.organization_invitations enable row level security;

create policy organization_invitations_select_admin on public.organization_invitations for select to authenticated
using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.organization_invitations from anon, authenticated;
grant select on public.organization_invitations to authenticated;

create or replace function public.create_org_invitation(invitee_email text, invitee_role public.organization_role default 'member')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_org_id uuid; actor_role public.organization_role; normalized_email text; created_invitation public.organization_invitations; invitation_token text;
begin
  normalized_email := lower(trim(invitee_email));
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email' using errcode = '22023'; end if;
  select org_id, role into target_org_id, actor_role from public.organization_members where user_id = auth.uid();
  if target_org_id is null or actor_role not in ('owner', 'admin') then raise exception 'Administrator required' using errcode = '42501'; end if;
  if invitee_role = 'owner' or (actor_role = 'admin' and invitee_role <> 'member') then raise exception 'Role not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.organization_members membership join public.user_profiles profile on profile.id = membership.user_id where membership.org_id = target_org_id and lower(profile.email) = normalized_email) then raise exception 'User is already a member' using errcode = '23505'; end if;
  update public.organization_invitations set cancelled_at = now() where org_id = target_org_id and email = normalized_email and accepted_at is null and cancelled_at is null;
  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.organization_invitations (org_id, token_hash, email, role, invited_by) values (target_org_id, extensions.digest(invitation_token, 'sha256'), normalized_email, invitee_role, auth.uid()) returning * into created_invitation;
  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id) values (target_org_id, auth.uid(), 'invitation.created', 'invitation', created_invitation.id);
  return jsonb_build_object('id', created_invitation.id, 'token', invitation_token);
end;
$$;

create or replace function public.accept_org_invitation(invitation_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.organization_invitations; current_email text; email_confirmed timestamptz; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if invitation_token !~ '^[a-f0-9]{64}$' then raise exception 'Invitation is not active' using errcode = '22023'; end if;
  select lower(email), email_confirmed_at into current_email, email_confirmed from auth.users where id = current_user_id;
  select * into invitation from public.organization_invitations where token_hash = extensions.digest(invitation_token, 'sha256') for update;
  if invitation.id is null or invitation.accepted_at is not null or invitation.cancelled_at is not null or invitation.expires_at <= now() then raise exception 'Invitation is not active' using errcode = '22023'; end if;
  if email_confirmed is null then raise exception 'Confirmed email required' using errcode = '42501'; end if;
  if current_email is distinct from invitation.email then raise exception 'Invitation email does not match' using errcode = '42501'; end if;
  if exists (select 1 from public.organization_members where user_id = current_user_id) then raise exception 'User already belongs to an organization' using errcode = '23505'; end if;
  insert into public.organization_members (org_id, user_id, role) values (invitation.org_id, current_user_id, invitation.role);
  update public.organization_invitations set accepted_at = now(), accepted_by = current_user_id where id = invitation.id;
  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id) values (invitation.org_id, current_user_id, 'invitation.accepted', 'invitation', invitation.id);
  return invitation.org_id;
end;
$$;

create or replace function public.cancel_org_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare invitation_org_id uuid;
begin
  select org_id into invitation_org_id from public.organization_invitations where id = invitation_id and accepted_at is null and cancelled_at is null;
  if invitation_org_id is null or not public.has_org_role(invitation_org_id, array['owner', 'admin']::public.organization_role[]) then raise exception 'Invitation not found or forbidden' using errcode = '42501'; end if;
  update public.organization_invitations set cancelled_at = now() where id = invitation_id;
  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id) values (invitation_org_id, auth.uid(), 'invitation.cancelled', 'invitation', invitation_id);
end;
$$;

create or replace function public.change_org_member_role(target_user_id uuid, target_role public.organization_role)
returns void language plpgsql security definer set search_path = '' as $$
declare target_org_id uuid; actor_role public.organization_role; existing_role public.organization_role;
begin
  select org_id, role into target_org_id, actor_role from public.organization_members where user_id = auth.uid();
  select role into existing_role from public.organization_members where org_id = target_org_id and user_id = target_user_id for update;
  if actor_role <> 'owner' or target_user_id = auth.uid() or existing_role is null or existing_role = 'owner' or target_role = 'owner' then raise exception 'Role change forbidden' using errcode = '42501'; end if;
  update public.organization_members set role = target_role where org_id = target_org_id and user_id = target_user_id;
  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id, metadata) values (target_org_id, auth.uid(), 'member.role_changed', 'member', target_user_id, jsonb_build_object('role', target_role));
end;
$$;

revoke all on function public.create_org_invitation(text, public.organization_role) from public;
revoke all on function public.accept_org_invitation(text) from public;
revoke all on function public.cancel_org_invitation(uuid) from public;
revoke all on function public.change_org_member_role(uuid, public.organization_role) from public;
grant execute on function public.create_org_invitation(text, public.organization_role) to authenticated;
grant execute on function public.accept_org_invitation(text) to authenticated;
grant execute on function public.cancel_org_invitation(uuid) to authenticated;
grant execute on function public.change_org_member_role(uuid, public.organization_role) to authenticated;

commit;

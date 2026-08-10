begin;

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

revoke all on function public.create_org_invitation(text, public.organization_role) from public;
revoke all on function public.accept_org_invitation(text) from public;
grant execute on function public.create_org_invitation(text, public.organization_role) to authenticated;
grant execute on function public.accept_org_invitation(text) to authenticated;

commit;

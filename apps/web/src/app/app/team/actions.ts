"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth-context";

const uuid = z.string().uuid();

export async function createInvitation(formData: FormData) {
  const input = z.object({ email: z.string().trim().email(), role: z.enum(["admin", "member"]) }).safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!input.success) redirect("/app/configuracoes?error=invalid_invitation");

  const { supabase, orgId } = await getAuthContext();

  // Checagem "de UX" antes de criar o convite — a trava de verdade fica
  // dentro de accept_org_invitation (0042_billing_enforcement.sql), essa
  // aqui só evita criar um convite que já sabemos que vai estourar.
  // Soma membros + convites pendentes (não só aceitos), pra não deixar
  // mandar vários convites de uma vez passando do limite. Limite nulo
  // (org sem organization_billing, ou nunca vinculada ao Stripe) = sem
  // limite — assim toda organização de hoje continua sem restrição.
  const { data: billing } = await supabase.from("organization_billing").select("effective_seats_limit").eq("org_id", orgId).maybeSingle();
  const seatLimit = billing?.effective_seats_limit;
  if (seatLimit !== null && seatLimit !== undefined) {
    const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
      supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("organization_invitations").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("accepted_at", null).is("cancelled_at", null)
    ]);
    const currentCount = (memberCount ?? 0) + (pendingCount ?? 0);
    if (currentCount >= seatLimit) redirect("/app/configuracoes?error=seat_limit_reached");
  }

  const { data, error } = await supabase.rpc("create_org_invitation", { invitee_email: input.data.email, invitee_role: input.data.role });
  if (error || !data || typeof data.token !== "string") redirect("/app/configuracoes?error=invitation_failed");
  redirect(`/app/configuracoes?success=invitation_created&invitation=${data.token}`);
}

export async function cancelInvitation(formData: FormData) {
  const id = uuid.safeParse(formData.get("invitation_id"));
  if (!id.success) redirect("/app/configuracoes?error=invalid_invitation");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_org_invitation", { invitation_id: id.data });
  if (error) redirect("/app/configuracoes?error=invitation_cancel_failed");
  redirect("/app/configuracoes?success=invitation_cancelled");
}

export async function changeMemberRole(formData: FormData) {
  const input = z.object({ userId: uuid, role: z.enum(["admin", "member"]) }).safeParse({ userId: formData.get("user_id"), role: formData.get("role") });
  if (!input.success) redirect("/app/configuracoes?error=invalid_role");
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_org_member_role", { target_user_id: input.data.userId, target_role: input.data.role });
  if (error) redirect("/app/configuracoes?error=role_change_failed");
  redirect("/app/configuracoes?success=role_changed");
}

export async function removeMember(formData: FormData) {
  const input = z.object({ userId: uuid, replacementId: z.union([uuid, z.literal("")]) }).safeParse({ userId: formData.get("user_id"), replacementId: formData.get("replacement_user_id") ?? "" });
  if (!input.success) redirect("/app/configuracoes?error=invalid_removal");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_org_member", { target_user_id: input.data.userId, replacement_user_id: input.data.replacementId || null });
  if (error) redirect("/app/configuracoes?error=member_removal_failed");
  redirect("/app/configuracoes?success=member_removed");
}

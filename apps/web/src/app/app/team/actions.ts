"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

export async function createInvitation(formData: FormData) {
  const input = z.object({ email: z.string().trim().email(), role: z.enum(["admin", "member"]) }).safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!input.success) redirect("/app/configuracoes?error=invalid_invitation");
  const supabase = await createClient();
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

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export async function acceptInvitation(formData: FormData) {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) redirect("/invite/invalid?error=invalid_invitation");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_org_invitation", { invitation_token: token.data });
  if (error) redirect(`/invite/${token.data}?error=accept_failed`);
  redirect("/app?success=invitation_accepted");
}

export async function createInvitedAccount(formData: FormData) {
  const input = z.object({ token: tokenSchema, email: z.string().trim().email(), password: z.string().min(8).max(128), fullName: z.string().trim().min(2).max(120) }).safeParse({ token: formData.get("token"), email: formData.get("email"), password: formData.get("password"), fullName: formData.get("full_name") });
  if (!input.success) redirect(`/invite/${formData.get("token")}?error=invalid_signup`);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const callback = `${protocol}://${host}/auth/callback?next=${encodeURIComponent(`/invite/${input.data.token}`)}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: input.data.email, password: input.data.password, options: { data: { full_name: input.data.fullName }, emailRedirectTo: callback } });
  if (error) redirect(`/invite/${input.data.token}?error=signup_failed`);
  if (data.session) redirect(`/invite/${input.data.token}?success=account_created`);
  redirect(`/invite/${input.data.token}?success=check_email`);
}

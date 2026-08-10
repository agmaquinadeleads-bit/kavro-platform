"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const passwordSchema = z.string().min(10).max(128);

export async function updatePassword(formData: FormData) {
  const password = passwordSchema.safeParse(formData.get("password"));
  const confirmation = formData.get("password_confirmation");
  if (!password.success || password.data !== confirmation) {
    redirect("/update-password?error=invalid_password");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) redirect("/update-password?error=update_failed");
  redirect("/app");
}


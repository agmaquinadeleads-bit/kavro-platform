"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128)
});

export async function login(formData: FormData) {
  const requestedNext = String(formData.get("next") ?? "");
  const next = /^\/invite\/[a-f0-9]{64}$/.test(requestedNext) || requestedNext === "/app/team" ? requestedNext : "/";
  const credentials = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!credentials.success) {
    redirect(`/login?error=invalid_input&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials.data);

  if (error) {
    redirect(`/login?error=invalid_credentials&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (email.success) {
    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${origin}/auth/callback?next=/update-password`
    });
  }
  redirect("/forgot-password?sent=1");
}


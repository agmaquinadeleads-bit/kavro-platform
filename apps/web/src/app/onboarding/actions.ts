"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const organizationNameSchema = z.string().trim().min(2).max(120);

function slugify(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return `${normalized || "empresa"}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createOrganization(formData: FormData) {
  const name = organizationNameSchema.safeParse(formData.get("organization_name"));
  if (!name.success) redirect("/onboarding?error=invalid_name");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existingMembership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existingMembership) redirect("/app");

  const { error } = await supabase.rpc("create_organization", {
    organization_name: name.data,
    organization_slug: slugify(name.data)
  });

  if (error) redirect("/onboarding?error=create_failed");
  redirect("/app");
}


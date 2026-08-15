"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";

const createBrandSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function createBrand(formData: FormData) {
  const input = createBrandSchema.safeParse({ name: formData.get("name") });
  if (!input.success) redirect("/app/conteudo?error=invalid_brand");

  const { supabase, orgId, role } = await getAuthContext();
  if (role !== "owner" && role !== "admin") redirect("/app/conteudo?error=forbidden");

  const { data, error } = await supabase.from("brands").insert({ org_id: orgId, name: input.data.name }).select("id").maybeSingle();
  if (error || !data) redirect("/app/conteudo?error=brand_create_failed");

  revalidatePath("/app/conteudo");
  redirect(`/app/conteudo?brand=${data.id}&success=brand_created`);
}

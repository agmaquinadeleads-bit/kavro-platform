import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Memoizado por requisição via React cache(): o layout (/app/layout.tsx) e a
// page ativa chamam getAuthContext() de forma independente, mas dentro da
// mesma renderização do servidor o React reaproveita o resultado da primeira
// chamada em vez de repetir as consultas de auth/membership — evita pagar
// duas vezes o round-trip pro Supabase Auth + organization_members em toda
// navegação, que era uma causa real de lentidão.
export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  return { supabase, user, orgId: membership.org_id, role: membership.role };
});

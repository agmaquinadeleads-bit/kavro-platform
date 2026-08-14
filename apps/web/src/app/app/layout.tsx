import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
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

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", membership.org_id)
    .single();

  const metadataName = user.user_metadata?.full_name;
  const userName = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : user.email?.split("@")[0] ?? "Usuário";
  const canSeeTeamTasks = membership.role === "owner" || membership.role === "admin";

  return (
    <div className="app-shell">
      <AppSidebar userName={userName} organizationName={organization?.name ?? "Organização"} canSeeTeamTasks={canSeeTeamTasks} />
      <section className="workspace">{children}</section>
    </div>
  );
}

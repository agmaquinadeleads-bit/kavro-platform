import { AppSidebar } from "@/components/AppSidebar";
import { getAuthContext } from "@/lib/auth-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, orgId, role } = await getAuthContext();

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  const metadataName = user.user_metadata?.full_name;
  const userName = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : user.email?.split("@")[0] ?? "Usuário";
  const canSeeTeamTasks = role === "owner" || role === "admin";

  return (
    <div className="app-shell">
      <AppSidebar userName={userName} organizationName={organization?.name ?? "Organização"} canSeeTeamTasks={canSeeTeamTasks} />
      <section className="workspace">{children}</section>
    </div>
  );
}

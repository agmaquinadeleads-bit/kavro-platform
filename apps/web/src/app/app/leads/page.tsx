import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadsPageClient } from "@/components/LeadsPageClient";
import { type LeadRowData } from "@/components/LeadRow";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Leads | Kavro CRM"
};

type LeadsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
    page?: string;
    pageSize?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
};

// Whitelist de colunas permitidas para sort (segurança contra SQL injection)
const SORTABLE_COLUMNS = ["name", "email", "phone", "source", "stage_id", "value_in_cents", "owner_id", "created_at"];
const VALID_PAGE_SIZES = [25, 50, 100];

const stageColorMap: Record<string, "gray" | "blue" | "amber" | "green" | "purple"> = {
  "gray": "gray",
  "blue": "blue",
  "amber": "amber",
  "green": "green",
  "purple": "purple"
};

function getStageColor(stagePosition: number): "gray" | "blue" | "amber" | "green" | "purple" {
  const colors: Array<"gray" | "blue" | "amber" | "green" | "purple"> = [
    "blue",
    "amber",
    "purple",
    "green",
    "gray"
  ];
  return colors[stagePosition % colors.length] || "gray";
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;

  // Parse and validate pagination parameters
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const pageSize = VALID_PAGE_SIZES.includes(parseInt(params.pageSize || "25", 10))
    ? parseInt(params.pageSize || "25", 10)
    : 25;
  const sortBy = SORTABLE_COLUMNS.includes(params.sortBy || "created_at")
    ? (params.sortBy || "created_at")
    : "created_at";
  const sortOrder = (params.sortOrder === "asc" ? "asc" : "desc") as "asc" | "desc";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  const orgId = membership.org_id;

  // Fetch total count for pagination
  const { count: totalCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);

  const totalItems = totalCount || 0;

  // Calculate offset
  const offset = (page - 1) * pageSize;

  // Fetch paginated and sorted leads for this organization
  const { data: leadsData } = await supabase
    .from("leads")
    .select("id, name, email, phone, source, stage_id, owner_id, value_in_cents, created_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order(sortBy, { ascending: sortOrder === "asc" })
    .range(offset, offset + pageSize - 1);

  // Fetch stage information
  const stageIds = [...new Set((leadsData ?? []).map((lead) => lead.stage_id))];
  const { data: stagesData } = await supabase
    .from("pipeline_stages")
    .select("id, name, position")
    .in("id", stageIds);

  const stageMap = new Map(
    (stagesData ?? []).map((stage) => [
      stage.id,
      { name: stage.name, position: stage.position }
    ])
  );

  // Fetch owner information (members with their profiles)
  const ownerIds = [
    ...new Set(
      (leadsData ?? [])
        .map((lead) => lead.owner_id)
        .filter((id) => id !== null)
    )
  ];

  const { data: membersData } = await supabase
    .from("organization_members")
    .select("user_id, user_profiles(full_name)")
    .eq("org_id", orgId)
    .in("user_id", ownerIds.length > 0 ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);

  const memberMap = new Map(
    (membersData ?? []).map((member) => {
      const profile = Array.isArray(member.user_profiles)
        ? member.user_profiles[0]
        : member.user_profiles;
      return [member.user_id, profile?.full_name || null];
    })
  );

  // Map the leads to the format expected by LeadsTable
  const mappedLeads: LeadRowData[] = (leadsData ?? []).map((lead) => {
    const stageInfo = stageMap.get(lead.stage_id);
    const stageName = stageInfo?.name ?? "Desconhecida";
    const stagePosition = stageInfo?.position ?? 0;
    const stageColor = getStageColor(stagePosition);

    const ownerName = lead.owner_id ? memberMap.get(lead.owner_id) || null : null;

    return {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      stageName,
      stageColor,
      valueInCents: Number(lead.value_in_cents),
      ownerName,
      createdAt: lead.created_at
    };
  });

  const errorMessage = params.error
    ? {
        invalid_lead: "Revise os dados do lead.",
        create_failed: "Não foi possível criar o lead.",
        update_failed: "Não foi possível atualizar o lead."
      }[params.error]
    : undefined;

  const successMessage = params.success
    ? {
        created: "Lead criado com sucesso.",
        updated: "Lead atualizado com sucesso."
      }[params.success]
    : undefined;

  return (
    <main className="leads-page">
      <div className="leads-header">
        <div className="leads-title-section">
          <h1>Leads</h1>
          <p className="leads-subtitle">
            {totalItems === 0
              ? "Nenhum lead criado"
              : `${totalItems} ${totalItems === 1 ? "lead" : "leads"}`}
          </p>
        </div>
        <div className="leads-actions">
          <Link href="/app" className="btn-secondary">
            ← Voltar ao dashboard
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="feedback error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="feedback success" role="status">
          {successMessage}
        </div>
      ) : null}

      <div className="leads-table-container">
        <LeadsPageClient
          leads={mappedLeads}
          totalItems={totalItems}
          currentPage={page}
          pageSize={pageSize}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />
      </div>

      <style jsx>{`
        .leads-page {
          padding: 28px;
          display: grid;
          gap: 24px;
          min-width: 0;
          overflow: visible;
        }

        .leads-header {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
        }

        .leads-title-section {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .leads-title-section h1 {
          font-size: 28px;
          font-weight: 700;
          color: var(--ink);
          margin: 0;
          line-height: 1.2;
        }

        .leads-subtitle {
          font-size: 14px;
          color: var(--muted);
          margin: 0;
        }

        .leads-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }

        .btn-secondary {
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--surface);
          color: var(--ink);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: background-color 0.15s ease;
        }

        .btn-secondary:hover {
          background: #f5f7f5;
        }

        .feedback {
          padding: 12px 16px;
          border-radius: 8px;
          border-left: 4px solid transparent;
          font-size: 14px;
        }

        .feedback.error {
          background: #fff5f5;
          border-left-color: #d45c5c;
          color: #9b3c3c;
        }

        .feedback.success {
          background: #f0fbf5;
          border-left-color: #158a55;
          color: #22764d;
        }

        .leads-table-container {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: auto;
          display: flex;
          flex-direction: column;
        }

        .leads-table-wrapper {
          width: 100%;
        }
      `}</style>
    </main>
  );
}

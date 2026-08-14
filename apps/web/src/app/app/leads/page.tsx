import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadsPageClient } from "@/components/LeadsPageClient";
import { type LeadRowData } from "@/components/LeadRow";
import { createClient } from "@/lib/supabase/server";
import "./page.css";

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
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    stage?: string;
    origin?: string;
    creative?: string;
  }>;
};

// Whitelist de colunas permitidas para sort (segurança contra SQL injection)
const SORTABLE_COLUMNS = ["name", "email", "phone", "source", "stage_id", "value_in_cents", "owner_id", "created_at"];
const VALID_PAGE_SIZES = [25, 50, 100];

// Validação de filtros
function validateDateFormat(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return null;
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime())) return null;
  return dateStr;
}

function validateUUID(id: string | undefined): string | null {
  if (!id) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) ? id : null;
}

function validateSearchString(search: string | undefined): string | null {
  if (!search) return null;
  const trimmed = search.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  return trimmed;
}

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

  // Parse and validate filter parameters
  const searchText = validateSearchString(params.search);
  const dateFrom = validateDateFormat(params.dateFrom);
  const dateTo = validateDateFormat(params.dateTo);
  const stageId = validateUUID(params.stage);
  const originText = params.origin ? params.origin.trim().substring(0, 120) : null;
  const creativeId = validateUUID(params.creative);

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

  // Build base query with filters
  let countQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);

  let leadsQuery = supabase
    .from("leads")
    .select("id, name, email, phone, source, stage_id, owner_id, value_in_cents, created_at")
    .eq("org_id", orgId)
    .is("deleted_at", null);

  // Apply search filter (name or email)
  if (searchText) {
    countQuery = countQuery.or(`name.ilike.%${searchText}%,email.ilike.%${searchText}%`);
    leadsQuery = leadsQuery.or(`name.ilike.%${searchText}%,email.ilike.%${searchText}%`);
  }

  // Apply date filters
  if (dateFrom) {
    countQuery = countQuery.gte("created_at", `${dateFrom}T00:00:00Z`);
    leadsQuery = leadsQuery.gte("created_at", `${dateFrom}T00:00:00Z`);
  }

  if (dateTo) {
    countQuery = countQuery.lte("created_at", `${dateTo}T23:59:59Z`);
    leadsQuery = leadsQuery.lte("created_at", `${dateTo}T23:59:59Z`);
  }

  // Apply stage filter
  if (stageId) {
    countQuery = countQuery.eq("stage_id", stageId);
    leadsQuery = leadsQuery.eq("stage_id", stageId);
  }

  // Apply origin filter
  if (originText) {
    countQuery = countQuery.eq("source", originText);
    leadsQuery = leadsQuery.eq("source", originText);
  }

  // Apply creative filter (if creatives table exists)
  // NOTE: This assumes a future migration adds creative_id to leads table
  if (creativeId) {
    // Currently placeholder - will be implemented when creatives table is added
  }

  // Fetch total count for pagination
  const { count: totalCount } = await countQuery;
  const totalItems = totalCount || 0;

  // Calculate offset
  const offset = (page - 1) * pageSize;

  // Fetch paginated and sorted leads for this organization
  const { data: leadsData } = await leadsQuery
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

  // Fetch all stages for filter dropdown
  const { data: allStagesData } = await supabase
    .from("pipeline_stages")
    .select("id, name")
    .eq("org_id", orgId)
    .order("position", { ascending: true });

  // Fetch all origins for filter dropdown
  const { data: originsData } = await supabase
    .from("leads")
    .select("source")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .is("source", "not.is.null");

  const origins = Array.from(
    new Set(
      (originsData ?? [])
        .map((row) => row.source)
        .filter((s) => s !== null)
    )
  ).sort();

  // Fetch creatives for filter dropdown (placeholder - will be populated when creatives table exists)
  const creatives: Array<{ id: string; name: string }> = [];

  // Create maps for badge display
  const stageNamesMap: Record<string, string> = {};
  (allStagesData ?? []).forEach((stage) => {
    stageNamesMap[stage.id] = stage.name;
  });

  const creativeNamesMap: Record<string, string> = {};
  creatives.forEach((creative) => {
    creativeNamesMap[creative.id] = creative.name;
  });

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
          filterData={{
            searchText: searchText || "",
            dateFrom,
            dateTo,
            selectedStage: stageId,
            selectedOrigin: originText,
            selectedCreative: creativeId,
            stages: allStagesData ?? [],
            origins,
            creatives,
            stageNamesMap,
            creativeNamesMap
          }}
        />
      </div>

    </main>
  );
}

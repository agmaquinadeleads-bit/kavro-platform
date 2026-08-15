"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";

const uuidSchema = z.string().uuid();

type ActionResult = { success: boolean; error?: string };

const updateLeadSchema = z.object({
  leadId: uuidSchema,
  version: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  email: z.union([z.string().trim().email(), z.literal("")]),
  phone: z.string().trim().max(32),
  source: z.string().trim().max(120),
  value: z.coerce.number().min(0).max(999_999_999),
  followUp: z.string().trim(),
  notes: z.string().trim().max(10000)
});

// Mesma lógica de updateLead em actions.ts, mas sem redirect() — retorna um
// resultado pro client component do modal tratar (o modal precisa continuar
// aberto e mostrar feedback inline, ao invés de navegar pra fora do Kanban).
export async function updateLeadModal(formData: FormData): Promise<ActionResult> {
  const input = updateLeadSchema.safeParse({
    leadId: formData.get("lead_id"),
    version: formData.get("version"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    value: formData.get("value") || 0,
    followUp: formData.get("follow_up") ?? "",
    notes: formData.get("notes") ?? ""
  });
  if (!input.success) return { success: false, error: "invalid_lead" };

  const followUpAt = input.data.followUp ? new Date(input.data.followUp) : null;
  if (followUpAt && Number.isNaN(followUpAt.getTime())) return { success: false, error: "invalid_date" };

  const { supabase, orgId } = await getAuthContext();
  const { data, error } = await supabase
    .from("leads")
    .update({
      name: input.data.name,
      email: input.data.email || null,
      phone: input.data.phone || null,
      source: input.data.source || null,
      value_in_cents: Math.round(input.data.value * 100),
      follow_up_at: followUpAt?.toISOString() ?? null,
      notes: input.data.notes || null
    })
    .eq("id", input.data.leadId)
    .eq("org_id", orgId)
    .eq("version", input.data.version)
    .select("id");

  if (error) return { success: false, error: "update_failed" };
  if (!data?.length) return { success: false, error: "stale_lead" };

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  revalidatePath(`/app/leads/${input.data.leadId}`);
  return { success: true };
}

const assignLeadSchema = z.object({
  leadId: uuidSchema,
  version: z.coerce.number().int().positive(),
  ownerId: z.union([uuidSchema, z.literal("")])
});

// Mesma lógica de assignLead em actions.ts, sem redirect().
export async function assignLeadModal(formData: FormData): Promise<ActionResult> {
  const input = assignLeadSchema.safeParse({
    leadId: formData.get("lead_id"),
    version: formData.get("version"),
    ownerId: formData.get("owner_id") ?? ""
  });
  if (!input.success) return { success: false, error: "invalid_assignment" };

  const { supabase, user, orgId, role } = await getAuthContext();
  if (role === "member" && input.data.ownerId !== user.id) {
    return { success: false, error: "assignment_forbidden" };
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ owner_id: input.data.ownerId || null })
    .eq("id", input.data.leadId)
    .eq("org_id", orgId)
    .eq("version", input.data.version)
    .select("id");

  if (error) return { success: false, error: "assignment_failed" };
  if (!data?.length) return { success: false, error: "stale_lead" };

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  revalidatePath(`/app/leads/${input.data.leadId}`);
  return { success: true };
}

const createTaskSchema = z.object({
  leadId: uuidSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000),
  dueAt: z.string().trim()
});

// Mesma lógica de createLeadTask em actions.ts, sem redirect().
export async function createLeadTaskModal(formData: FormData): Promise<ActionResult> {
  const input = createTaskSchema.safeParse({
    leadId: formData.get("lead_id"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    dueAt: formData.get("due_at") ?? ""
  });
  if (!input.success) return { success: false, error: "invalid_task" };

  const dueAt = input.data.dueAt ? new Date(input.data.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return { success: false, error: "invalid_task_date" };

  const { supabase, user, orgId } = await getAuthContext();

  // Confirma que o lead pertence à org do usuário antes de criar a tarefa —
  // leadId vem do client (formData), nunca deve ser aceito sem checagem.
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", input.data.leadId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!lead) return { success: false, error: "task_create_failed" };

  const { error } = await supabase.from("lead_tasks").insert({
    org_id: orgId,
    lead_id: input.data.leadId,
    title: input.data.title,
    description: input.data.description || null,
    due_at: dueAt?.toISOString() ?? null,
    assigned_to: user.id,
    created_by: user.id
  });
  if (error) return { success: false, error: "task_create_failed" };

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  revalidatePath(`/app/leads/${input.data.leadId}`);
  return { success: true };
}

const toggleTaskSchema = z.object({
  leadId: uuidSchema,
  taskId: uuidSchema,
  version: z.coerce.number().int().positive(),
  completed: z.enum(["true", "false"])
});

// Mesma lógica de toggleLeadTask em actions.ts, sem redirect().
export async function toggleLeadTaskModal(formData: FormData): Promise<ActionResult> {
  const input = toggleTaskSchema.safeParse({
    leadId: formData.get("lead_id"),
    taskId: formData.get("task_id"),
    version: formData.get("version"),
    completed: formData.get("completed")
  });
  if (!input.success) return { success: false, error: "invalid_task" };

  const { supabase, orgId } = await getAuthContext();
  const { data, error } = await supabase
    .from("lead_tasks")
    .update({ completed_at: input.data.completed === "true" ? new Date().toISOString() : null })
    .eq("id", input.data.taskId)
    .eq("lead_id", input.data.leadId)
    .eq("org_id", orgId)
    .eq("version", input.data.version)
    .select("id");
  if (error) return { success: false, error: "task_update_failed" };
  if (!data?.length) return { success: false, error: "stale_task" };

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  revalidatePath(`/app/leads/${input.data.leadId}`);
  return { success: true };
}

const addTagSchema = z.object({
  leadId: uuidSchema,
  tagName: z.string().trim().min(1).max(60)
});

// Aplica uma tag existente (busca por nome, case-insensitive, na org) ou
// tenta criar uma nova — criar só funciona pra owner/admin (RLS de tags),
// membro recebe tag_create_forbidden se a tag ainda não existir. Se a tag
// tiver routes_to_pipeline_id configurado, o trigger route_lead_by_tag
// (migration 0020) move o lead pro funil de destino na hora.
export async function addTagToLeadModal(formData: FormData): Promise<ActionResult> {
  const input = addTagSchema.safeParse({
    leadId: formData.get("lead_id"),
    tagName: formData.get("tag_name")
  });
  if (!input.success) return { success: false, error: "invalid_tag" };

  const { supabase, orgId } = await getAuthContext();

  const { data: lead } = await supabase.from("leads").select("id").eq("id", input.data.leadId).eq("org_id", orgId).is("deleted_at", null).maybeSingle();
  if (!lead) return { success: false, error: "tag_failed" };

  const { data: orgTags } = await supabase.from("tags").select("id, name").eq("org_id", orgId);
  const existingTag = (orgTags ?? []).find((tag) => tag.name.toLowerCase() === input.data.tagName.toLowerCase());

  let tagId = existingTag?.id;
  if (!tagId) {
    const { data: createdTag, error: createError } = await supabase.from("tags").insert({ org_id: orgId, name: input.data.tagName }).select("id").maybeSingle();
    if (createError || !createdTag) return { success: false, error: "tag_create_forbidden" };
    tagId = createdTag.id;
  }

  const { error: linkError } = await supabase.from("lead_tags").insert({ org_id: orgId, lead_id: input.data.leadId, tag_id: tagId });
  // 23505 = já vinculada (chave duplicada) — não é um erro do ponto de vista do usuário.
  if (linkError && linkError.code !== "23505") return { success: false, error: "tag_failed" };

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  revalidatePath(`/app/leads/${input.data.leadId}`);
  return { success: true };
}

const removeTagSchema = z.object({
  leadId: uuidSchema,
  tagId: uuidSchema
});

export async function removeTagFromLeadModal(formData: FormData): Promise<ActionResult> {
  const input = removeTagSchema.safeParse({
    leadId: formData.get("lead_id"),
    tagId: formData.get("tag_id")
  });
  if (!input.success) return { success: false, error: "invalid_tag" };

  const { supabase, orgId } = await getAuthContext();
  const { error } = await supabase.from("lead_tags").delete().eq("org_id", orgId).eq("lead_id", input.data.leadId).eq("tag_id", input.data.tagId);
  if (error) return { success: false, error: "tag_failed" };

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  revalidatePath(`/app/leads/${input.data.leadId}`);
  return { success: true };
}

const movePipelineSchema = z.object({
  leadId: uuidSchema,
  version: z.coerce.number().int().positive(),
  pipelineId: uuidSchema,
  stageId: uuidSchema
});

// Mover manualmente pra outro funil (não pra outra etapa do mesmo funil —
// isso já existe no card do Kanban). Só aceita etapas abertas do funil de
// destino (rejeita Ganho/Perdido no servidor, não só na UI) — mover pra
// uma etapa de fechamento por aqui puxaria won_product/loss_reason
// obrigatórios, que esse formulário genérico não coleta.
export async function moveLeadPipelineModal(formData: FormData): Promise<ActionResult> {
  const input = movePipelineSchema.safeParse({
    leadId: formData.get("lead_id"),
    version: formData.get("version"),
    pipelineId: formData.get("pipeline_id"),
    stageId: formData.get("stage_id")
  });
  if (!input.success) return { success: false, error: "invalid_move" };

  const { supabase, orgId } = await getAuthContext();

  const { data: targetStage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("id", input.data.stageId)
    .eq("pipeline_id", input.data.pipelineId)
    .eq("org_id", orgId)
    .eq("is_won", false)
    .eq("is_lost", false)
    .maybeSingle();
  if (!targetStage) return { success: false, error: "invalid_move" };

  const { data, error } = await supabase
    .from("leads")
    .update({ pipeline_id: input.data.pipelineId, stage_id: input.data.stageId })
    .eq("id", input.data.leadId)
    .eq("org_id", orgId)
    .eq("version", input.data.version)
    .select("id");

  if (error) return { success: false, error: "move_failed" };
  if (!data?.length) return { success: false, error: "stale_lead" };

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  revalidatePath(`/app/leads/${input.data.leadId}`);
  return { success: true };
}

export type LeadDetailLead = {
  id: string;
  pipeline_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  value_in_cents: number;
  follow_up_at: string | null;
  notes: string | null;
  status: "open" | "won" | "lost";
  owner_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type LeadDetailEventChange = { old: string | number | boolean | null; new: string | number | boolean | null };

export type LeadDetailEventMetadata = {
  operation?: string;
  from_stage?: string | null;
  to_stage?: string | null;
  changes?: Record<string, LeadDetailEventChange | boolean>;
};

export type LeadDetailEvent = {
  id: string;
  action: string;
  created_at: string;
  metadata: LeadDetailEventMetadata | null;
};

export type LeadDetailTask = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  completed_at: string | null;
  version: number;
  created_at: string;
};

export type LeadDetailMember = {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
};

export type LeadDetailPurchase = {
  id: string;
  product: string;
  value_in_cents: number;
  purchased_at: string;
};

export type LeadDetailTagItem = {
  id: string;
  name: string;
  color: string;
};

export type LeadDetailPipeline = {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
};

export type LeadDetailData = {
  lead: LeadDetailLead;
  events: LeadDetailEvent[];
  tasks: LeadDetailTask[];
  members: LeadDetailMember[];
  purchases: LeadDetailPurchase[];
  tags: LeadDetailTagItem[];
  pipelines: LeadDetailPipeline[];
  currentPipelineId: string | null;
};

// Busca os dados completos do lead pro modal — mesma query que existe em
// apps/web/src/app/app/leads/[id]/page.tsx. orgId vem sempre de
// getAuthContext() (nunca do client), e leadId é validado como UUID antes de
// entrar em qualquer query. Retorna null (em vez de notFound()) se o lead não
// existir ou não pertencer à org do usuário — quem chama é o client, não uma
// renderização de página.
export async function getLeadDetailData(leadId: string): Promise<LeadDetailData | null> {
  const idCheck = uuidSchema.safeParse(leadId);
  if (!idCheck.success) return null;

  const { supabase, orgId } = await getAuthContext();

  const [{ data: lead }, { data: events }, { data: tasks }, { data: members }, { data: purchases }, { data: leadTags }, { data: pipelineRows }, { data: stageRows }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, pipeline_id, name, email, phone, source, value_in_cents, follow_up_at, notes, status, owner_id, version, created_at, updated_at")
      .eq("id", idCheck.data)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("audit_events")
      .select("id, action, created_at, metadata")
      .eq("org_id", orgId)
      .eq("resource_id", idCheck.data)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("lead_tasks")
      .select("id, title, description, due_at, completed_at, version, created_at")
      .eq("org_id", orgId)
      .eq("lead_id", idCheck.data)
      .order("completed_at", { ascending: true, nullsFirst: true })
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("organization_members")
      .select("user_id, role, user_profiles(full_name, email)")
      .eq("org_id", orgId)
      .order("created_at"),
    // Só retorna algo quando este lead é um card de cliente no funil de
    // pós-venda (customer_lead_id) — leads do funil de vendas não têm
    // compras associadas a si mesmos, só ao card do cliente que geraram.
    supabase
      .from("customer_purchases")
      .select("id, product, value_in_cents, purchased_at")
      .eq("org_id", orgId)
      .eq("customer_lead_id", idCheck.data)
      .order("purchased_at", { ascending: false }),
    supabase
      .from("lead_tags")
      .select("tags(id, name, color)")
      .eq("org_id", orgId)
      .eq("lead_id", idCheck.data),
    supabase
      .from("pipelines")
      .select("id, name")
      .eq("org_id", orgId)
      .order("position", { ascending: true }),
    // Só etapas abertas (nem Ganho, nem Perdido) — mover pra outro funil por
    // aqui é um caminho genérico, etapas de fechamento já têm fluxo próprio
    // (produto vendido / motivo da perda) no Kanban.
    supabase
      .from("pipeline_stages")
      .select("id, pipeline_id, name, position")
      .eq("org_id", orgId)
      .eq("is_won", false)
      .eq("is_lost", false)
      .order("position", { ascending: true })
  ]);

  if (!lead) return null;

  const normalizedMembers: LeadDetailMember[] = (members ?? []).map(
    (member: { user_id: string; role: string; user_profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null }) => {
      const profile = Array.isArray(member.user_profiles) ? member.user_profiles[0] : member.user_profiles;
      return {
        user_id: member.user_id,
        role: member.role,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? null
      };
    }
  );

  const normalizedTags: LeadDetailTagItem[] = (leadTags ?? [])
    .map((row: { tags: LeadDetailTagItem | LeadDetailTagItem[] | null }) => (Array.isArray(row.tags) ? row.tags[0] : row.tags))
    .filter((tag): tag is LeadDetailTagItem => tag !== null && tag !== undefined);

  const stagesByPipeline = new Map<string, Array<{ id: string; name: string }>>();
  for (const stage of stageRows ?? []) {
    const list = stagesByPipeline.get(stage.pipeline_id) ?? [];
    list.push({ id: stage.id, name: stage.name });
    stagesByPipeline.set(stage.pipeline_id, list);
  }
  const normalizedPipelines: LeadDetailPipeline[] = (pipelineRows ?? []).map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    stages: stagesByPipeline.get(pipeline.id) ?? []
  }));

  return {
    lead,
    events: events ?? [],
    tasks: tasks ?? [],
    members: normalizedMembers,
    purchases: purchases ?? [],
    tags: normalizedTags,
    pipelines: normalizedPipelines,
    currentPipelineId: lead.pipeline_id
  };
}

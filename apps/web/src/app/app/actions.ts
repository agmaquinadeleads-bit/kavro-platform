"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

async function authenticatedContext() {
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
}

const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.union([z.string().trim().email(), z.literal("")]),
  phone: z.string().trim().max(32),
  source: z.string().trim().max(120),
  value: z.coerce.number().min(0).max(999_999_999),
  pipelineId: uuidSchema,
  stageId: uuidSchema
});

export async function createLead(formData: FormData) {
  const input = createLeadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    value: formData.get("value") || 0,
    pipelineId: formData.get("pipeline_id"),
    stageId: formData.get("stage_id")
  });
  if (!input.success) redirect("/app/leads?error=invalid_lead");

  const { supabase, user, orgId } = await authenticatedContext();
  const { error } = await supabase.from("leads").insert({
    org_id: orgId,
    pipeline_id: input.data.pipelineId,
    stage_id: input.data.stageId,
    created_by: user.id,
    name: input.data.name,
    email: input.data.email || null,
    phone: input.data.phone || null,
    source: input.data.source || null,
    value_in_cents: Math.round(input.data.value * 100)
  });

  if (error) redirect("/app/leads?error=create_failed");
  revalidatePath("/app");
  revalidatePath("/app/leads");
  redirect("/app/leads?success=lead_created");
}

const moveLeadSchema = z.object({
  leadId: uuidSchema,
  stageId: uuidSchema,
  version: z.coerce.number().int().positive(),
  lossReason: z.string().trim().max(160),
  wonProduct: z.string().trim().max(160)
});

export async function moveLead(formData: FormData) {
  const input = moveLeadSchema.safeParse({
    leadId: formData.get("lead_id"),
    stageId: formData.get("stage_id"),
    version: formData.get("version"),
    lossReason: formData.get("loss_reason") ?? "",
    wonProduct: formData.get("won_product") ?? ""
  });
  if (!input.success) redirect("/app/pipeline?error=invalid_move");

  const { supabase, orgId } = await authenticatedContext();
  const { data, error } = await supabase
    .from("leads")
    .update({ stage_id: input.data.stageId, loss_reason: input.data.lossReason || null, won_product: input.data.wonProduct || null })
    .eq("id", input.data.leadId)
    .eq("org_id", orgId)
    .eq("version", input.data.version)
    .select("id, pipeline_id");

  if (error) redirect("/app/pipeline?error=move_failed");
  if (!data?.length) redirect("/app/pipeline?error=stale_lead");
  const movedLead = data[0];
  if (!movedLead) redirect("/app/pipeline?error=stale_lead");
  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect(`/app/pipeline?pipeline=${movedLead.pipeline_id}&success=lead_moved`);
}

const archiveLeadSchema = z.object({
  leadId: uuidSchema,
  version: z.coerce.number().int().positive()
});

export async function archiveLead(formData: FormData) {
  const input = archiveLeadSchema.safeParse({
    leadId: formData.get("lead_id"),
    version: formData.get("version")
  });
  if (!input.success) redirect("/app/pipeline?error=invalid_archive");

  const { supabase, orgId } = await authenticatedContext();
  const { data, error } = await supabase
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.data.leadId)
    .eq("org_id", orgId)
    .eq("version", input.data.version)
    .select("id, pipeline_id");

  if (error) redirect("/app/pipeline?error=archive_failed");
  if (!data?.length) redirect("/app/pipeline?error=stale_lead");
  const archivedLead = data[0];
  if (!archivedLead) redirect("/app/pipeline?error=stale_lead");
  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect(`/app/pipeline?pipeline=${archivedLead.pipeline_id}&success=lead_archived`);
}

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

export async function updateLead(formData: FormData) {
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
  if (!input.success) redirect("/app?error=invalid_lead");

  const followUpAt = input.data.followUp ? new Date(input.data.followUp) : null;
  if (followUpAt && Number.isNaN(followUpAt.getTime())) redirect(`/app/leads/${input.data.leadId}?error=invalid_date`);

  const { supabase, orgId } = await authenticatedContext();
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

  if (error) redirect(`/app/leads/${input.data.leadId}?error=update_failed`);
  if (!data?.length) redirect(`/app/leads/${input.data.leadId}?error=stale_lead`);
  revalidatePath("/app");
  revalidatePath(`/app/leads/${input.data.leadId}`);
  redirect(`/app/leads/${input.data.leadId}?success=lead_updated`);
}

const stageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["open", "won", "lost"]),
  pipelineId: uuidSchema
});

export async function createStage(formData: FormData) {
  const input = stageSchema.safeParse({ name: formData.get("name"), kind: formData.get("kind"), pipelineId: formData.get("pipeline_id") });
  if (!input.success) redirect("/app/pipeline?error=invalid_stage");

  const { supabase, orgId, role } = await authenticatedContext();
  if (role !== "owner" && role !== "admin") redirect("/app/pipeline?error=forbidden");

  // pipeline_id vem do form (funil ativo na aba), nunca assumido como "o primeiro" —
  // valida que pertence à org antes de usar.
  const { data: pipeline } = await supabase.from("pipelines").select("id").eq("id", input.data.pipelineId).eq("org_id", orgId).maybeSingle();
  if (!pipeline) redirect("/app/pipeline?error=pipeline_missing");

  const { data: existingStages } = await supabase.from("pipeline_stages").select("position, is_won, is_lost").eq("org_id", orgId).eq("pipeline_id", pipeline.id).order("position", { ascending: false });
  if ((existingStages?.length ?? 0) >= 30) redirect(`/app/pipeline?pipeline=${pipeline.id}&error=stage_limit`);
  if (input.data.kind === "won" && existingStages?.some((stage) => stage.is_won)) redirect(`/app/pipeline?pipeline=${pipeline.id}&error=stage_kind_exists`);
  if (input.data.kind === "lost" && existingStages?.some((stage) => stage.is_lost)) redirect(`/app/pipeline?pipeline=${pipeline.id}&error=stage_kind_exists`);

  const position = (existingStages?.[0]?.position ?? -1) + 1;
  const { error } = await supabase.from("pipeline_stages").insert({ org_id: orgId, pipeline_id: pipeline.id, name: input.data.name, position, is_won: input.data.kind === "won", is_lost: input.data.kind === "lost" });
  if (error) redirect(`/app/pipeline?pipeline=${pipeline.id}&error=stage_create_failed`);
  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect(`/app/pipeline?pipeline=${pipeline.id}&success=stage_created`);
}

const renameStageSchema = z.object({ stageId: uuidSchema, name: z.string().trim().min(1).max(100) });

export async function renameStage(formData: FormData) {
  const input = renameStageSchema.safeParse({ stageId: formData.get("stage_id"), name: formData.get("name") });
  if (!input.success) redirect("/app/pipeline?error=invalid_stage");
  const { supabase, orgId, role } = await authenticatedContext();
  if (role !== "owner" && role !== "admin") redirect("/app/pipeline?error=forbidden");
  const { data, error } = await supabase.from("pipeline_stages").update({ name: input.data.name, updated_at: new Date().toISOString() }).eq("id", input.data.stageId).eq("org_id", orgId).select("id, pipeline_id");
  if (error || !data?.length) redirect("/app/pipeline?error=stage_update_failed");
  const renamedStage = data[0];
  if (!renamedStage) redirect("/app/pipeline?error=stage_update_failed");
  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect(`/app/pipeline?pipeline=${renamedStage.pipeline_id}&success=stage_renamed`);
}

const moveStageSchema = z.object({ stageId: uuidSchema, direction: z.enum(["left", "right"]) });

export async function moveStagePosition(formData: FormData) {
  const input = moveStageSchema.safeParse({ stageId: formData.get("stage_id"), direction: formData.get("direction") });
  if (!input.success) redirect("/app/pipeline?error=invalid_stage");
  const { supabase, orgId, role } = await authenticatedContext();
  if (role !== "owner" && role !== "admin") redirect("/app/pipeline?error=forbidden");

  const { data: targetStage } = await supabase.from("pipeline_stages").select("id, pipeline_id, position").eq("id", input.data.stageId).eq("org_id", orgId).maybeSingle();
  if (!targetStage) redirect("/app/pipeline?error=invalid_stage");

  const { data: allStages } = await supabase.from("pipeline_stages").select("id, position").eq("org_id", orgId).eq("pipeline_id", targetStage.pipeline_id).order("position", { ascending: true });
  const stages = allStages ?? [];
  const currentIndex = stages.findIndex((stage) => stage.id === targetStage.id);
  const swapIndex = input.data.direction === "left" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex === -1 || swapIndex < 0 || swapIndex >= stages.length) redirect(`/app/pipeline?pipeline=${targetStage.pipeline_id}`);

  const swapStage = stages[swapIndex];
  if (!swapStage) redirect(`/app/pipeline?pipeline=${targetStage.pipeline_id}&error=stage_move_failed`);
  // pipeline_stages tem UNIQUE (org_id, pipeline_id, position) E CHECK (position >= 0)
  // — trocar as duas posições direto violaria a constraint de unicidade, e um
  // valor temporário negativo violaria o check de não-negativo. Usamos um
  // sentinela positivo fora da faixa real (limite de 30 etapas por pipeline).
  const TEMP_POSITION = 999999;
  const { error: tempError } = await supabase.from("pipeline_stages").update({ position: TEMP_POSITION }).eq("id", targetStage.id).eq("org_id", orgId);
  if (tempError) redirect(`/app/pipeline?pipeline=${targetStage.pipeline_id}&error=stage_move_failed`);
  const { error: swapError } = await supabase.from("pipeline_stages").update({ position: targetStage.position }).eq("id", swapStage.id).eq("org_id", orgId);
  if (swapError) redirect(`/app/pipeline?pipeline=${targetStage.pipeline_id}&error=stage_move_failed`);
  const { error } = await supabase.from("pipeline_stages").update({ position: swapStage.position }).eq("id", targetStage.id).eq("org_id", orgId);
  if (error) redirect(`/app/pipeline?pipeline=${targetStage.pipeline_id}&error=stage_move_failed`);

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect(`/app/pipeline?pipeline=${targetStage.pipeline_id}&success=stage_moved`);
}

const deleteStageSchema = z.object({ stageId: uuidSchema });

export async function deleteStage(formData: FormData) {
  const input = deleteStageSchema.safeParse({ stageId: formData.get("stage_id") });
  if (!input.success) redirect("/app/pipeline?error=invalid_stage");
  const { supabase, orgId, role } = await authenticatedContext();
  if (role !== "owner" && role !== "admin") redirect("/app/pipeline?error=forbidden");

  const { data: stage } = await supabase.from("pipeline_stages").select("id, pipeline_id").eq("id", input.data.stageId).eq("org_id", orgId).maybeSingle();
  if (!stage) redirect("/app/pipeline?error=invalid_stage");

  // Bloqueia exclusão se a etapa tiver leads ativos — evita perda de dados
  // (usuário precisa mover os leads pra outra etapa antes de excluir).
  const { count: activeLeadsCount } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("stage_id", input.data.stageId).is("deleted_at", null);
  if ((activeLeadsCount ?? 0) > 0) redirect(`/app/pipeline?pipeline=${stage.pipeline_id}&error=stage_has_leads`);

  // Bloqueia exclusão da última etapa do pipeline (precisa ter ao menos 1).
  const { count: totalStagesCount } = await supabase.from("pipeline_stages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("pipeline_id", stage.pipeline_id);
  if ((totalStagesCount ?? 0) <= 1) redirect(`/app/pipeline?pipeline=${stage.pipeline_id}&error=stage_last_one`);

  const { error } = await supabase.from("pipeline_stages").delete().eq("id", input.data.stageId).eq("org_id", orgId);
  if (error) redirect(`/app/pipeline?pipeline=${stage.pipeline_id}&error=stage_delete_failed`);
  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect(`/app/pipeline?pipeline=${stage.pipeline_id}&success=stage_deleted`);
}

const pipelineNameSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function createPipeline(formData: FormData) {
  const input = pipelineNameSchema.safeParse({ name: formData.get("name") });
  if (!input.success) redirect("/app/pipeline?error=invalid_pipeline");

  const { supabase, orgId, role } = await authenticatedContext();
  if (role !== "owner" && role !== "admin") redirect("/app/pipeline?error=forbidden");

  // Limite defensivo — evita abuso e mantém a barra de abas usável (mesmo
  // espírito do limite de 30 etapas por pipeline em createStage).
  const { count: pipelineCount } = await supabase.from("pipelines").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if ((pipelineCount ?? 0) >= 10) redirect("/app/pipeline?error=pipeline_limit");

  const { data: existingPipelines } = await supabase.from("pipelines").select("position").eq("org_id", orgId).order("position", { ascending: false }).limit(1);
  const position = (existingPipelines?.[0]?.position ?? -1) + 1;

  const { data: created, error } = await supabase.from("pipelines").insert({ org_id: orgId, name: input.data.name, position }).select("id").maybeSingle();
  if (error || !created) redirect("/app/pipeline?error=pipeline_create_failed");

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect(`/app/pipeline?pipeline=${created.id}&success=pipeline_created`);
}

const renamePipelineSchema = z.object({ pipelineId: uuidSchema, name: z.string().trim().min(1).max(100) });

export async function renamePipeline(formData: FormData) {
  const input = renamePipelineSchema.safeParse({ pipelineId: formData.get("pipeline_id"), name: formData.get("name") });
  if (!input.success) redirect("/app/pipeline?error=invalid_pipeline");

  const { supabase, orgId, role } = await authenticatedContext();
  if (role !== "owner" && role !== "admin") redirect("/app/pipeline?error=forbidden");

  const { data, error } = await supabase.from("pipelines").update({ name: input.data.name, updated_at: new Date().toISOString() }).eq("id", input.data.pipelineId).eq("org_id", orgId).select("id");
  if (error || !data?.length) redirect("/app/pipeline?error=pipeline_update_failed");

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect(`/app/pipeline?pipeline=${input.data.pipelineId}&success=pipeline_renamed`);
}

const deletePipelineSchema = z.object({ pipelineId: uuidSchema });

export async function deletePipeline(formData: FormData) {
  const input = deletePipelineSchema.safeParse({ pipelineId: formData.get("pipeline_id") });
  if (!input.success) redirect("/app/pipeline?error=invalid_pipeline");

  const { supabase, orgId, role } = await authenticatedContext();
  if (role !== "owner" && role !== "admin") redirect("/app/pipeline?error=forbidden");

  const { data: pipeline } = await supabase.from("pipelines").select("id, is_protected").eq("id", input.data.pipelineId).eq("org_id", orgId).maybeSingle();
  if (!pipeline) redirect("/app/pipeline?error=pipeline_missing");

  // Pós-venda e Parceiros e fornecedores são alvo de automações (trigger de
  // venda ganha / trigger de tag) — excluí-los quebraria essas automações.
  if (pipeline.is_protected) redirect(`/app/pipeline?pipeline=${pipeline.id}&error=pipeline_protected`);

  // leads.pipeline_id não tem ON DELETE CASCADE de propósito — qualquer
  // lead (mesmo arquivado) bloqueia o DELETE no banco. Checamos antes pra
  // dar um erro claro em vez de deixar o Postgres estourar a violação de FK.
  const { count: leadCount } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("pipeline_id", input.data.pipelineId);
  if ((leadCount ?? 0) > 0) redirect(`/app/pipeline?pipeline=${pipeline.id}&error=pipeline_has_leads`);

  const { count: pipelineCount } = await supabase.from("pipelines").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if ((pipelineCount ?? 0) <= 1) redirect(`/app/pipeline?pipeline=${pipeline.id}&error=pipeline_last_one`);

  const { error } = await supabase.from("pipelines").delete().eq("id", input.data.pipelineId).eq("org_id", orgId);
  if (error) redirect(`/app/pipeline?pipeline=${pipeline.id}&error=pipeline_delete_failed`);

  revalidatePath("/app");
  revalidatePath("/app/pipeline");
  redirect("/app/pipeline?success=pipeline_deleted");
}

const createTaskSchema = z.object({
  leadId: uuidSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000),
  dueAt: z.string().trim()
});

export async function createLeadTask(formData: FormData) {
  const input = createTaskSchema.safeParse({
    leadId: formData.get("lead_id"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    dueAt: formData.get("due_at") ?? ""
  });
  if (!input.success) redirect(`/app/leads/${formData.get("lead_id")}?error=invalid_task`);

  const dueAt = input.data.dueAt ? new Date(input.data.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) redirect(`/app/leads/${input.data.leadId}?error=invalid_task_date`);

  const { supabase, user, orgId } = await authenticatedContext();
  const { error } = await supabase.from("lead_tasks").insert({
    org_id: orgId,
    lead_id: input.data.leadId,
    title: input.data.title,
    description: input.data.description || null,
    due_at: dueAt?.toISOString() ?? null,
    assigned_to: user.id,
    created_by: user.id
  });
  if (error) redirect(`/app/leads/${input.data.leadId}?error=task_create_failed`);
  revalidatePath(`/app/leads/${input.data.leadId}`);
  redirect(`/app/leads/${input.data.leadId}?success=task_created`);
}

const createLeadActivitySchema = z.object({
  leadId: uuidSchema,
  activityType: z.enum(["note", "call", "meeting", "message"]),
  content: z.string().trim().min(1).max(4000),
  occurredAt: z.string().trim(),
});

export async function createLeadActivity(formData: FormData) {
  const fallbackLeadId = String(formData.get("lead_id") ?? "");
  const input = createLeadActivitySchema.safeParse({
    leadId: formData.get("lead_id"),
    activityType: formData.get("activity_type"),
    content: formData.get("content"),
    occurredAt: formData.get("occurred_at") ?? "",
  });

  if (!input.success) {
    redirect(`/app/leads/${fallbackLeadId}?error=invalid_activity`);
  }

  const occurredAt = input.data.occurredAt
    ? new Date(input.data.occurredAt)
    : new Date();

  if (Number.isNaN(occurredAt.getTime())) {
    redirect(`/app/leads/${input.data.leadId}?error=invalid_activity_date`);
  }

  const { supabase, user, orgId } = await authenticatedContext();
  const { error } = await supabase.from("lead_activities").insert({
    org_id: orgId,
    lead_id: input.data.leadId,
    activity_type: input.data.activityType,
    content: input.data.content,
    occurred_at: occurredAt.toISOString(),
    created_by: user.id,
  });

  if (error) {
    redirect(`/app/leads/${input.data.leadId}?error=activity_create_failed`);
  }

  revalidatePath(`/app/leads/${input.data.leadId}`);
  revalidatePath("/app");
  redirect(`/app/leads/${input.data.leadId}?success=activity_created`);
}

const toggleTaskSchema = z.object({
  leadId: uuidSchema,
  taskId: uuidSchema,
  version: z.coerce.number().int().positive(),
  completed: z.enum(["true", "false"])
});

export async function toggleLeadTask(formData: FormData) {
  const input = toggleTaskSchema.safeParse({
    leadId: formData.get("lead_id"),
    taskId: formData.get("task_id"),
    version: formData.get("version"),
    completed: formData.get("completed")
  });
  if (!input.success) redirect(`/app/leads/${formData.get("lead_id")}?error=invalid_task`);

  const { supabase, orgId } = await authenticatedContext();
  const { data, error } = await supabase.from("lead_tasks")
    .update({ completed_at: input.data.completed === "true" ? new Date().toISOString() : null })
    .eq("id", input.data.taskId)
    .eq("lead_id", input.data.leadId)
    .eq("org_id", orgId)
    .eq("version", input.data.version)
    .select("id");
  if (error) redirect(`/app/leads/${input.data.leadId}?error=task_update_failed`);
  if (!data?.length) redirect(`/app/leads/${input.data.leadId}?error=stale_task`);
  revalidatePath(`/app/leads/${input.data.leadId}`);
  redirect(`/app/leads/${input.data.leadId}?success=task_updated`);
}

const assignLeadSchema = z.object({ leadId: uuidSchema, version: z.coerce.number().int().positive(), ownerId: z.union([uuidSchema, z.literal("")]) });

export async function assignLead(formData: FormData) {
  const input = assignLeadSchema.safeParse({ leadId: formData.get("lead_id"), version: formData.get("version"), ownerId: formData.get("owner_id") ?? "" });
  if (!input.success) redirect(`/app/leads/${formData.get("lead_id")}?error=invalid_assignment`);
  const { supabase, user, orgId, role } = await authenticatedContext();
  if (role === "member" && input.data.ownerId !== user.id) redirect(`/app/leads/${input.data.leadId}?error=assignment_forbidden`);
  const { data, error } = await supabase.from("leads").update({ owner_id: input.data.ownerId || null }).eq("id", input.data.leadId).eq("org_id", orgId).eq("version", input.data.version).select("id");
  if (error) redirect(`/app/leads/${input.data.leadId}?error=assignment_failed`);
  if (!data?.length) redirect(`/app/leads/${input.data.leadId}?error=stale_lead`);
  revalidatePath("/app"); revalidatePath(`/app/leads/${input.data.leadId}`);
  redirect(`/app/leads/${input.data.leadId}?success=lead_assigned`);
}

const deleteBulkLeadsSchema = z.object({
  leadIds: z.array(uuidSchema).min(1).max(1000)
});

export async function deleteBulkLeads(leadIds: string[]) {
  const input = deleteBulkLeadsSchema.safeParse({ leadIds });
  if (!input.success) {
    return { success: false, count: 0, error: "invalid_leads" };
  }

  const { supabase, orgId } = await authenticatedContext();

  const { data, error } = await supabase
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", input.data.leadIds)
    .eq("org_id", orgId)
    .select("id");

  if (error) {
    return { success: false, count: 0, error: "delete_failed" };
  }

  revalidatePath("/app");
  revalidatePath("/app/leads");

  return { success: true, count: data?.length ?? 0 };
}

const moveBulkLeadsToLossSchema = z.object({
  leadIds: z.array(uuidSchema).min(1).max(1000),
  reason: z.enum(["no_budget", "competitor", "gave_up", "no_contact", "other", "duplicate"])
});

export async function moveBulkLeadsToLoss(leadIds: string[], reason: string) {
  const input = moveBulkLeadsToLossSchema.safeParse({ leadIds, reason });
  if (!input.success) {
    return { success: false, count: 0, error: "invalid_input" };
  }

  const { supabase, orgId } = await authenticatedContext();

  // Find the "Loss" stage (or similar)
  const { data: lossStage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_lost", true)
    .limit(1)
    .maybeSingle();

  if (stageError || !lossStage) {
    return { success: false, count: 0, error: "loss_stage_not_found" };
  }

  // Update leads to move them to Loss stage
  const { data, error } = await supabase
    .from("leads")
    .update({
      stage_id: lossStage.id,
      loss_reason: input.data.reason,
      status: "lost"
    })
    .in("id", input.data.leadIds)
    .eq("org_id", orgId)
    .select("id");

  if (error) {
    return { success: false, count: 0, error: "update_failed" };
  }

  revalidatePath("/app");
  revalidatePath("/app/leads");

  return { success: true, count: data?.length ?? 0, reason: input.data.reason };
}

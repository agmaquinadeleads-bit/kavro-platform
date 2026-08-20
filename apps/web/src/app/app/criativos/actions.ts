"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";

const BASE_PATH = "/app/criativos";
// Origens de lead foi movido pra dentro de Configurações (o gerenciamento
// de criativos continua aqui) — createLeadSource/deleteLeadSource abaixo
// usam esse path próprio em vez de BASE_PATH.
const SOURCES_PATH = "/app/configuracoes";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif"
};

async function requireManager() {
  const context = await getAuthContext();
  if (context.role !== "owner" && context.role !== "admin") redirect(`${BASE_PATH}?error=forbidden`);
  return context;
}

const createSourceSchema = z.object({ name: z.string().trim().min(1).max(60) });

export async function createLeadSource(formData: FormData) {
  const input = createSourceSchema.safeParse({ name: formData.get("name") });
  if (!input.success) redirect(`${SOURCES_PATH}?error=invalid_source`);

  const { supabase, orgId } = await requireManager();
  const { error } = await supabase.from("lead_sources").insert({ org_id: orgId, name: input.data.name });
  // Índice único (org_id, lower(name)) — 23505 é "já existe uma origem com esse nome".
  if (error) redirect(`${SOURCES_PATH}?error=${error.code === "23505" ? "source_duplicate" : "source_create_failed"}`);

  // Origens também alimentam o <select> de criativos — revalida os dois.
  revalidatePath(SOURCES_PATH);
  revalidatePath(BASE_PATH);
  redirect(`${SOURCES_PATH}?success=source_created`);
}

const deleteSourceSchema = z.object({ sourceId: z.string().uuid() });

export async function deleteLeadSource(formData: FormData) {
  const input = deleteSourceSchema.safeParse({ sourceId: formData.get("source_id") });
  if (!input.success) redirect(`${SOURCES_PATH}?error=invalid_source`);

  const { supabase, orgId } = await requireManager();
  // Criativos que usavam essa origem ficam sem origem (on delete set null
  // na FK) — não bloqueia a exclusão.
  const { error } = await supabase.from("lead_sources").delete().eq("id", input.data.sourceId).eq("org_id", orgId);
  if (error) redirect(`${SOURCES_PATH}?error=source_delete_failed`);

  revalidatePath(SOURCES_PATH);
  revalidatePath(BASE_PATH);
  redirect(`${SOURCES_PATH}?success=source_deleted`);
}

const creativeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  sourceId: z.string().uuid().optional(),
  initialMessage: z.string().trim().min(1).max(4000)
});

function extensionFor(file: File): string {
  const fromMime = IMAGE_EXTENSIONS[file.type];
  if (fromMime) return fromMime;
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5 && fromName !== file.name) return fromName.toLowerCase();
  return "jpg";
}

// Cadastro e edição do criativo compartilham o mesmo formulário (ver
// page.tsx) — usados por createAdCreative/updateAdCreative abaixo.
async function readCreativeInput(formData: FormData) {
  const rawSourceId = formData.get("source_id");
  const input = creativeSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    sourceId: rawSourceId ? rawSourceId : undefined,
    initialMessage: formData.get("initial_message")
  });
  if (!input.success) redirect(`${BASE_PATH}?error=invalid_creative`);
  return input.data;
}

async function uploadCreativeImage(supabase: Awaited<ReturnType<typeof getAuthContext>>["supabase"], orgId: string, formData: FormData): Promise<string | undefined> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_IMAGE_BYTES) redirect(`${BASE_PATH}?error=image_too_large`);
  if (!file.type.startsWith("image/")) redirect(`${BASE_PATH}?error=invalid_image`);

  const objectKey = `${orgId}/${randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage.from("ad-creative-images").upload(objectKey, file, { contentType: file.type });
  if (error) redirect(`${BASE_PATH}?error=image_upload_failed`);
  return objectKey;
}

export async function createAdCreative(formData: FormData) {
  const input = await readCreativeInput(formData);
  const { supabase, orgId } = await requireManager();
  const imageObjectKey = await uploadCreativeImage(supabase, orgId, formData);

  const { error } = await supabase.from("ad_creatives").insert({
    org_id: orgId,
    name: input.name,
    source_id: input.sourceId ?? null,
    initial_message: input.initialMessage,
    image_object_key: imageObjectKey ?? null
  });
  if (error) redirect(`${BASE_PATH}?error=${error.code === "23505" ? "creative_duplicate_message" : "creative_create_failed"}`);

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}?success=creative_created`);
}

export async function updateAdCreative(formData: FormData) {
  const input = await readCreativeInput(formData);
  if (!input.id) redirect(`${BASE_PATH}?error=invalid_creative`);

  const { supabase, orgId } = await requireManager();
  const imageObjectKey = await uploadCreativeImage(supabase, orgId, formData);

  const { error } = await supabase.from("ad_creatives").update({
    name: input.name,
    source_id: input.sourceId ?? null,
    initial_message: input.initialMessage,
    ...(imageObjectKey ? { image_object_key: imageObjectKey } : {})
  }).eq("id", input.id).eq("org_id", orgId);
  if (error) redirect(`${BASE_PATH}?error=${error.code === "23505" ? "creative_duplicate_message" : "creative_update_failed"}`);

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}?success=creative_updated`);
}

const deleteCreativeSchema = z.object({ creativeId: z.string().uuid() });

export async function deleteAdCreative(formData: FormData) {
  const input = deleteCreativeSchema.safeParse({ creativeId: formData.get("creative_id") });
  if (!input.success) redirect(`${BASE_PATH}?error=invalid_creative`);

  const { supabase, orgId } = await requireManager();
  const { error } = await supabase.from("ad_creatives").delete().eq("id", input.data.creativeId).eq("org_id", orgId);
  if (error) redirect(`${BASE_PATH}?error=creative_delete_failed`);

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}?success=creative_deleted`);
}

"use server";

import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";

type PostIdea = { caption: string; imagePrompt: string };

const targetMonthSchema = z.string().regex(/^\d{4}-\d{2}-01$/);

// Toda action nessa página recebe brand_id + target_month como hidden
// fields (o mês vem implícito de qual página o usuário está, não de um
// seletor manual) — esse helper monta o caminho de volta pra visão micro
// sem precisar rebuscar a linha só pra saber o mês.
function monthPath(brandId: string, targetMonth: string): string {
  const [year, month] = targetMonth.split("-");
  return `/app/conteudo/${brandId}/${year}/${month}`;
}

// Claude às vezes envolve a resposta em cerca de markdown apesar da
// instrução — tira a cerca antes de tentar o parse, em vez de confiar
// cegamente no formato.
function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

async function generatePostIdeas(theme: string, postCount: number, brandVisualIdentity: string | null): Promise<PostIdea[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Geração por IA ainda não configurada nesse ambiente (falta ANTHROPIC_API_KEY).");

  const brandContext = brandVisualIdentity ? ` Diretrizes de marca (siga sempre): ${brandVisualIdentity}` : "";

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4000,
    system: `Você é um estrategista de conteúdo para redes sociais (Instagram/Facebook) de agências de marketing brasileiras.${brandContext} Responda SEMPRE só com um array JSON válido, sem texto antes ou depois, sem markdown.`,
    messages: [{
      role: "user",
      content: `Crie ${postCount} ideias de post pra essa linha editorial:\n\n${theme}\n\nResponda com um array JSON de exatamente ${postCount} objetos, cada um com "caption" (legenda pronta pra publicar, em português, até 2000 caracteres) e "imagePrompt" (descrição em inglês pra gerar uma imagem com IA, visual e específica, até 500 caracteres).`
    }]
  });

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  if (!textBlock) throw new Error("Resposta da IA sem conteúdo de texto.");

  const parsed = extractJsonArray(textBlock.text);
  if (!Array.isArray(parsed)) throw new Error("Resposta da IA em formato inesperado.");

  return parsed
    .filter((item): item is { caption: string; imagePrompt?: string } =>
      Boolean(item && typeof item === "object" && typeof (item as { caption?: unknown }).caption === "string"))
    .map((item) => ({ caption: item.caption.slice(0, 4000), imagePrompt: (item.imagePrompt ?? "").slice(0, 2000) }));
}

const generateLineSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  theme: z.string().trim().min(1).max(4000),
  postCount: z.coerce.number().int().min(1).max(20),
  targetMonth: targetMonthSchema
});

// Cria a linha editorial e já gera os posts (só a legenda — a imagem é
// gerada depois, só pra posts de linhas aprovadas, pra não gastar com IA
// de ideias que talvez nem sejam aprovadas).
export async function generateEditorialLine(formData: FormData) {
  const rawBrandId = formData.get("brand_id");
  const input = generateLineSchema.safeParse({
    brandId: rawBrandId,
    name: formData.get("name"),
    theme: formData.get("theme"),
    postCount: formData.get("post_count") || 6,
    targetMonth: formData.get("target_month")
  });
  if (!input.success) redirect(`/app/conteudo/${rawBrandId}?error=invalid_line`);

  const { supabase, orgId, user } = await getAuthContext();

  const { data: brand } = await supabase.from("brands").select("id, visual_identity").eq("id", input.data.brandId).eq("org_id", orgId).maybeSingle();
  if (!brand) redirect("/app/conteudo?error=brand_missing");

  const backPath = monthPath(input.data.brandId, input.data.targetMonth);

  const { data: line, error: lineError } = await supabase
    .from("editorial_lines")
    .insert({ org_id: orgId, brand_id: input.data.brandId, name: input.data.name, theme: input.data.theme, target_month: input.data.targetMonth, created_by: user.id })
    .select("id")
    .maybeSingle();
  if (lineError || !line) redirect(`${backPath}?error=line_create_failed`);

  let ideas: PostIdea[];
  try {
    ideas = await generatePostIdeas(input.data.theme, input.data.postCount, brand.visual_identity);
  } catch {
    redirect(`${backPath}?line=${line.id}&error=ai_generation_failed`);
  }
  if (ideas.length === 0) redirect(`${backPath}?line=${line.id}&error=ai_generation_failed`);

  const { error: postsError } = await supabase.from("content_posts").insert(
    ideas.map((idea) => ({
      org_id: orgId,
      brand_id: input.data.brandId,
      editorial_line_id: line.id,
      caption: idea.caption,
      ai_image_prompt: idea.imagePrompt,
      created_by: user.id
    }))
  );
  if (postsError) redirect(`${backPath}?line=${line.id}&error=posts_create_failed`);

  await supabase.from("ai_generation_events").insert({
    org_id: orgId,
    brand_id: input.data.brandId,
    kind: "text",
    provider: "anthropic",
    requested_by: user.id
  });

  revalidatePath(backPath);
  redirect(`${backPath}?line=${line.id}&success=line_generated`);
}

const approveLineSchema = z.object({ lineId: z.string().uuid(), brandId: z.string().uuid(), targetMonth: targetMonthSchema });

export async function approveEditorialLine(formData: FormData) {
  const rawBrandId = formData.get("brand_id");
  const input = approveLineSchema.safeParse({ lineId: formData.get("line_id"), brandId: rawBrandId, targetMonth: formData.get("target_month") });
  if (!input.success) redirect(`/app/conteudo/${rawBrandId}?error=invalid_line`);

  const backPath = monthPath(input.data.brandId, input.data.targetMonth);
  const { supabase, orgId, role } = await getAuthContext();
  if (role !== "owner" && role !== "admin") redirect(`${backPath}?error=forbidden`);

  const { data, error } = await supabase.from("editorial_lines").update({ status: "approved" }).eq("id", input.data.lineId).eq("org_id", orgId).select("id");
  if (error || !data?.length) redirect(`${backPath}?error=line_approve_failed`);

  revalidatePath(backPath);
  redirect(`${backPath}?line=${input.data.lineId}&success=line_approved`);
}

const deleteLineSchema = z.object({ lineId: z.string().uuid(), brandId: z.string().uuid(), targetMonth: targetMonthSchema });

// Só permite excluir linhas ainda em rascunho (nunca aprovadas) — evita
// apagar conteúdo que já virou post agendado/publicado. Serve pra limpar
// gerações duplicadas ou testes.
export async function deleteEditorialLine(formData: FormData) {
  const rawBrandId = formData.get("brand_id");
  const input = deleteLineSchema.safeParse({ lineId: formData.get("line_id"), brandId: rawBrandId, targetMonth: formData.get("target_month") });
  if (!input.success) redirect(`/app/conteudo/${rawBrandId}?error=invalid_line`);

  const backPath = monthPath(input.data.brandId, input.data.targetMonth);
  const { supabase, orgId, role } = await getAuthContext();
  if (role !== "owner" && role !== "admin") redirect(`${backPath}?error=forbidden`);

  const { data: line } = await supabase.from("editorial_lines").select("id, status").eq("id", input.data.lineId).eq("org_id", orgId).maybeSingle();
  if (!line) redirect(`${backPath}?error=invalid_line`);
  if (line.status !== "draft") redirect(`${backPath}?error=line_not_draft`);

  await supabase.from("content_posts").delete().eq("org_id", orgId).eq("editorial_line_id", input.data.lineId);
  const { error } = await supabase.from("editorial_lines").delete().eq("id", input.data.lineId).eq("org_id", orgId);
  if (error) redirect(`${backPath}?error=line_delete_failed`);

  revalidatePath(backPath);
  redirect(`${backPath}?success=line_deleted`);
}

const generateImageSchema = z.object({
  postId: z.string().uuid(),
  brandId: z.string().uuid(),
  targetMonth: targetMonthSchema,
  extraInstructions: z.string().trim().max(2000).optional()
});

export async function generatePostImage(formData: FormData) {
  const rawBrandId = formData.get("brand_id");
  const rawExtra = formData.get("extra_instructions");
  const input = generateImageSchema.safeParse({
    postId: formData.get("post_id"),
    brandId: rawBrandId,
    targetMonth: formData.get("target_month"),
    extraInstructions: typeof rawExtra === "string" && rawExtra.trim().length > 0 ? rawExtra : undefined
  });
  if (!input.success) redirect(`/app/conteudo/${rawBrandId}?error=invalid_post`);

  const backPath = monthPath(input.data.brandId, input.data.targetMonth);
  const { supabase, orgId, user } = await getAuthContext();

  const [{ data: post }, { data: brand }] = await Promise.all([
    supabase
      .from("content_posts")
      .select("id, ai_image_prompt")
      .eq("id", input.data.postId)
      .eq("org_id", orgId)
      .eq("brand_id", input.data.brandId)
      .maybeSingle(),
    supabase.from("brands").select("visual_identity").eq("id", input.data.brandId).eq("org_id", orgId).maybeSingle()
  ]);
  if (!post) redirect(`${backPath}?error=invalid_post`);
  if (!post.ai_image_prompt) redirect(`${backPath}?error=missing_image_prompt`);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) redirect(`${backPath}?error=image_ai_not_configured`);

  const brandContext = brand?.visual_identity ? `Diretrizes de marca: ${brand.visual_identity}\n\n` : "";
  const extraContext = input.data.extraInstructions ? `\n\nInstruções adicionais (o que incluir/evitar): ${input.data.extraInstructions}` : "";
  const prompt = `${brandContext}${post.ai_image_prompt}${extraContext}`;

  const rawReference = formData.get("reference_image");
  const referenceImage = rawReference instanceof File && rawReference.size > 0 ? rawReference : null;

  let publicUrl: string;
  try {
    const openai = new OpenAI({ apiKey });
    const result = referenceImage
      ? await openai.images.edit({ model: "gpt-image-1", image: referenceImage, prompt, size: "1024x1024" })
      : await openai.images.generate({ model: "gpt-image-1", prompt, size: "1024x1024" });
    const base64 = result.data?.[0]?.b64_json;
    if (!base64) throw new Error("A IA não retornou uma imagem");

    const path = `${orgId}/${randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("content-images")
      .upload(path, Buffer.from(base64, "base64"), { contentType: "image/png", upsert: false });
    if (uploadError) throw uploadError;

    publicUrl = supabase.storage.from("content-images").getPublicUrl(path).data.publicUrl;
  } catch {
    redirect(`${backPath}?error=image_generation_failed`);
  }

  const { error: updateError } = await supabase
    .from("content_posts")
    .update({ image_url: publicUrl })
    .eq("id", post.id)
    .eq("org_id", orgId);
  if (updateError) redirect(`${backPath}?error=image_generation_failed`);

  await supabase.from("ai_generation_events").insert({
    org_id: orgId,
    brand_id: input.data.brandId,
    kind: "image",
    provider: "openai",
    requested_by: user.id
  });

  revalidatePath(backPath);
  redirect(`${backPath}?success=image_generated`);
}

const approvePostSchema = z.object({ postId: z.string().uuid(), brandId: z.string().uuid(), targetMonth: targetMonthSchema });

export async function approvePost(formData: FormData) {
  const rawBrandId = formData.get("brand_id");
  const input = approvePostSchema.safeParse({ postId: formData.get("post_id"), brandId: rawBrandId, targetMonth: formData.get("target_month") });
  if (!input.success) redirect(`/app/conteudo/${rawBrandId}?error=invalid_post`);

  const backPath = monthPath(input.data.brandId, input.data.targetMonth);
  const { supabase, orgId, role } = await getAuthContext();
  if (role !== "owner" && role !== "admin") redirect(`${backPath}?error=forbidden`);

  const { data, error } = await supabase
    .from("content_posts")
    .update({ status: "approved" })
    .eq("id", input.data.postId)
    .eq("org_id", orgId)
    .select("id");
  if (error || !data?.length) redirect(`${backPath}?error=post_approve_failed`);

  revalidatePath(backPath);
  redirect(`${backPath}?success=post_approved`);
}

const schedulePostSchema = z.object({
  postId: z.string().uuid(),
  brandId: z.string().uuid(),
  targetMonth: targetMonthSchema,
  scheduledAt: z.string().trim().min(1),
  providers: z.array(z.enum(["instagram", "facebook"])).min(1)
});

export async function schedulePost(formData: FormData) {
  const rawBrandId = formData.get("brand_id");
  const input = schedulePostSchema.safeParse({
    postId: formData.get("post_id"),
    brandId: rawBrandId,
    targetMonth: formData.get("target_month"),
    scheduledAt: formData.get("scheduled_at"),
    providers: formData.getAll("providers")
  });
  if (!input.success) redirect(`/app/conteudo/${rawBrandId}?error=invalid_schedule`);

  const backPath = monthPath(input.data.brandId, input.data.targetMonth);

  const scheduledDate = new Date(input.data.scheduledAt);
  if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
    redirect(`${backPath}?error=invalid_schedule_date`);
  }

  const { supabase, orgId } = await getAuthContext();

  const { data: post } = await supabase
    .from("content_posts")
    .select("id, image_url")
    .eq("id", input.data.postId)
    .eq("org_id", orgId)
    .eq("brand_id", input.data.brandId)
    .maybeSingle();
  if (!post) redirect(`${backPath}?error=invalid_post`);
  if (!post.image_url) redirect(`${backPath}?error=missing_image`);

  // Confirma que a marca tem conexão ativa pra cada rede escolhida — sem
  // isso o worker de publicação sempre falharia por falta de conexão.
  const { data: connections } = await supabase
    .from("social_connections")
    .select("provider")
    .eq("org_id", orgId)
    .eq("brand_id", input.data.brandId)
    .eq("status", "connected");
  const connectedProviders = new Set((connections ?? []).map((connection) => connection.provider));
  const missingProvider = input.data.providers.some((provider) => !connectedProviders.has(provider));
  if (missingProvider) redirect(`${backPath}?error=provider_not_connected`);

  const { data, error } = await supabase
    .from("content_posts")
    .update({ status: "scheduled", scheduled_at: scheduledDate.toISOString(), target_providers: input.data.providers })
    .eq("id", input.data.postId)
    .eq("org_id", orgId)
    .select("id");
  if (error || !data?.length) redirect(`${backPath}?error=schedule_failed`);

  revalidatePath(backPath);
  redirect(`${backPath}?success=post_scheduled`);
}

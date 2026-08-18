"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";

const sendMessageSchema = z.object({
  connectionId: z.string().uuid(),
  conversationId: z.string().uuid(),
  text: z.string().trim().max(20000)
});

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "weba"
};

// whatsapp_messages não tem policy de insert pro client (só service_role
// escreve lá — ver 0010_whatsapp_foundation.sql) — diferente de toda outra
// action deste projeto, essa não fala com o Supabase direto pra gravar a
// mensagem, chama a API NestJS com o access_token da sessão (mesmo padrão
// client-side já usado em meta-embedded-signup.tsx, mas do lado do
// servidor). O upload do anexo em si (se houver) já vai direto pro
// Storage por aqui, com a sessão do usuário — whatsapp-media libera
// insert pra membro da própria org (0033_whatsapp_media_bucket.sql).
export async function sendWhatsappMessage(formData: FormData) {
  const rawConnectionId = formData.get("connection_id");
  const rawConversationId = formData.get("conversation_id");
  const backPath = `/app/whatsapp?connection=${rawConnectionId}&conversation=${rawConversationId}`;

  const input = sendMessageSchema.safeParse({
    connectionId: rawConnectionId,
    conversationId: rawConversationId,
    text: formData.get("text")
  });
  if (!input.success) redirect(`${backPath}&error=invalid_message`);

  const mediaFile = formData.get("media");
  const hasMedia = mediaFile instanceof File && mediaFile.size > 0;
  if (!input.data.text && !hasMedia) redirect(`${backPath}&error=invalid_message`);

  const { supabase, orgId, accessToken } = await getAuthContext();

  let media: { objectKey: string; mimeType: string; messageType: "image" | "audio" } | undefined;
  if (hasMedia) {
    const file = mediaFile as File;
    if (file.size > MAX_MEDIA_BYTES) redirect(`${backPath}&error=media_too_large`);
    const messageType = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : null;
    if (!messageType) redirect(`${backPath}&error=invalid_media`);

    const extension = MEDIA_EXTENSIONS[file.type] ?? (messageType === "image" ? "jpg" : "ogg");
    const objectKey = `${orgId}/${input.data.connectionId}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("whatsapp-media").upload(objectKey, file, { contentType: file.type });
    if (uploadError) redirect(`${backPath}&error=media_upload_failed`);
    media = { objectKey, mimeType: file.type, messageType };
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!apiUrl) redirect(`${backPath}&error=send_failed`);

  const response = await fetch(`${apiUrl}/v1/whatsapp/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      connectionId: input.data.connectionId,
      conversationId: input.data.conversationId,
      text: input.data.text,
      mediaObjectKey: media?.objectKey,
      mediaMimeType: media?.mimeType,
      mediaMessageType: media?.messageType
    })
  });
  if (!response.ok) redirect(`${backPath}&error=send_failed`);

  revalidatePath("/app/whatsapp");
  redirect(`${backPath}&success=message_sent`);
}

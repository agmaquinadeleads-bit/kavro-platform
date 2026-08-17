"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";

const sendMessageSchema = z.object({
  connectionId: z.string().uuid(),
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1).max(20000)
});

// whatsapp_messages não tem policy de insert pro client (só service_role
// escreve lá — ver 0010_whatsapp_foundation.sql) — diferente de toda outra
// action deste projeto, essa não fala com o Supabase direto, chama a API
// NestJS com o access_token da sessão (mesmo padrão client-side já usado
// em meta-embedded-signup.tsx, mas aqui do lado do servidor).
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

  const { accessToken } = await getAuthContext();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!apiUrl) redirect(`${backPath}&error=send_failed`);

  const response = await fetch(`${apiUrl}/v1/whatsapp/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      connectionId: input.data.connectionId,
      conversationId: input.data.conversationId,
      text: input.data.text
    })
  });
  if (!response.ok) redirect(`${backPath}&error=send_failed`);

  revalidatePath("/app/whatsapp");
  redirect(`${backPath}&success=message_sent`);
}

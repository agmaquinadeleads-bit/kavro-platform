"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Igual ao "Marcar como não lida" do WhatsApp de verdade — lembrete
// manual pra voltar numa conversa depois, sem precisar de mensagem nova
// de verdade. unread_count é a mesma coluna que o worker de recebimento
// incrementa; só o navegador escreve nela via a policy/coluna liberada
// em 0032_whatsapp_mark_conversation_read.sql.
export function MarkUnreadButton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    const supabase = createClient();
    await supabase.from("whatsapp_conversations").update({ unread_count: 1 }).eq("id", conversationId);
    setBusy(false);
    router.refresh();
  };

  return (
    <button
      type="button"
      className="mark-unread-btn"
      onClick={(event) => void handleClick(event)}
      disabled={busy}
      aria-label="Marcar como não lida"
      title="Marcar como não lida"
    >
      ●
    </button>
  );
}

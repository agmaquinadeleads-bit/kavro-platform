"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// A página do WhatsApp é um Server Component — sem isso, mensagens/
// conversas novas só apareciam quando o usuário navegava (trocava de
// conversa, enviava algo). router.refresh() re-busca os dados do server
// no lugar, mantendo a página no ar — é o mais simples pra imitar o
// "chega na hora" do WhatsApp de verdade sem reescrever a tela pra
// Supabase Realtime. Pausa quando a aba não está visível, pra não gastar
// requisição à toa em segundo plano.
export function ChatAutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") routerRef.current.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return null;
}

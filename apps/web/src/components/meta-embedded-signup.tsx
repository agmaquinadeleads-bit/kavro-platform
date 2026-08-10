"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SignupData = {
  phoneNumberId: string;
  businessAccountId: string;
};

type PopupCompleteMessage = SignupData & {
  type: "KAVRO_META_SIGNUP_COMPLETE";
  nonce: string;
  code: string;
};

type PopupErrorMessage = {
  type: "KAVRO_META_SIGNUP_ERROR";
  nonce: string;
  message?: string;
};

type PopupMessage = PopupCompleteMessage | PopupErrorMessage;

function createNonce() {
  return window.crypto.randomUUID();
}

function isPopupMessage(value: unknown): value is PopupMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PopupMessage>;
  return candidate.type === "KAVRO_META_SIGNUP_COMPLETE" || candidate.type === "KAVRO_META_SIGNUP_ERROR";
}

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json() as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(" ");
    if (typeof body.message === "string") return body.message;
  } catch {
    // A resposta pode não conter JSON. Nesse caso usamos a mensagem segura abaixo.
  }
  return "Não foi possível confirmar a conexão com a Meta.";
}

export function MetaEmbeddedSignup() {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const configured = Boolean(appId && configId);
  const [state, setState] = useState<"idle" | "connecting" | "success" | "error">(configured ? "idle" : "error");
  const [message, setMessage] = useState(configured ? "" : "A configuração pública da Meta não foi encontrada neste ambiente.");
  const popupRef = useRef<Window | null>(null);
  const nonceRef = useRef("");
  const finalizingRef = useRef(false);

  useEffect(() => {
    const receive = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popupRef.current || !isPopupMessage(event.data)) return;
      if (event.data.nonce !== nonceRef.current) return;

      if (event.data.type === "KAVRO_META_SIGNUP_ERROR") {
        finalizingRef.current = false;
        setState("error");
        setMessage(event.data.message || "A conexão foi cancelada ou não pôde ser concluída.");
        return;
      }

      if (finalizingRef.current) return;
      finalizingRef.current = true;
      setState("connecting");
      setMessage("Autorização recebida. Confirmando o número com segurança...");

      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
        if (!data.session?.access_token || !apiUrl) throw new Error("A sessão do Kavro ou o endereço da API está ausente.");

        const response = await fetch(`${apiUrl}/v1/whatsapp/meta/onboarding`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${data.session.access_token}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            code: event.data.code,
            phoneNumberId: event.data.phoneNumberId,
            businessAccountId: event.data.businessAccountId
          })
        });

        if (!response.ok) throw new Error(await readErrorMessage(response));
        setState("success");
        setMessage("WhatsApp conectado com sucesso. Atualizando...");
        window.setTimeout(() => window.location.assign("/app/whatsapp/settings"), 900);
      } catch (error) {
        finalizingRef.current = false;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível confirmar a conexão. Tente novamente.");
      }
    };

    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    if (state !== "connecting" || !popupRef.current) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const popup = popupRef.current;
      if (popup?.closed && !finalizingRef.current) {
        popupRef.current = null;
        window.clearInterval(interval);
        setState("error");
        setMessage("A janela da Meta foi fechada antes da conclusão. Tente novamente.");
      } else if (Date.now() - startedAt > 5 * 60 * 1000) {
        popup?.close();
        popupRef.current = null;
        window.clearInterval(interval);
        setState("error");
        setMessage("O tempo da autorização terminou. Tente novamente.");
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [state]);

  const connect = () => {
    if (!configured) {
      setState("error");
      setMessage("A configuração pública da Meta não foi encontrada neste ambiente.");
      return;
    }

    finalizingRef.current = false;
    nonceRef.current = createNonce();
    const authUrl = new URL("/meta/auth", window.location.origin);
    authUrl.searchParams.set("nonce", nonceRef.current);
    const width = 620;
    const height = 760;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open(
      authUrl.toString(),
      "kavro_meta_auth",
      `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      setState("error");
      setMessage("O navegador bloqueou a janela da Meta. Libere pop-ups para este site e tente novamente.");
      return;
    }

    popupRef.current = popup;
    popup.focus();
    setState("connecting");
    setMessage("A janela segura do Kavro foi aberta. Continue nela para entrar com a Meta.");
  };

  return <>
    <button className="meta-connect-button" type="button" onClick={connect} disabled={!configured || state === "connecting" || state === "success"}>
      {state === "connecting" ? "Aguardando a Meta..." : state === "success" ? "Conectado" : "Continuar com a Meta"}
    </button>
    {message ? <small className={`availability-note ${state}`}>{message}</small> : null}
  </>;
}

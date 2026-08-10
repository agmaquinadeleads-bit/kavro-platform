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

type Readiness = {
  canManage?: boolean;
  official?: {
    metaAppConfigured?: boolean;
    credentialVaultConfigured?: boolean;
    webhookConfigured?: boolean;
  };
};

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

function describeReadiness(readiness: Readiness) {
  if (!readiness.canManage) return "Somente administradores podem conectar um número do WhatsApp.";
  if (!readiness.official?.metaAppConfigured) return "A configuração privada do aplicativo da Meta ainda não está completa na API do Kavro.";
  if (!readiness.official?.credentialVaultConfigured) return "O cofre seguro do Kavro ainda não está configurado na API. Adicione a chave service_role do Supabase de homologação.";
  if (!readiness.official?.webhookConfigured) return "O recebimento de mensagens ainda não está configurado. Adicione o token de verificação do webhook da Meta na API.";
  return "";
}

export function MetaEmbeddedSignup() {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const publicConfigured = Boolean(appId && configId);
  const [serverReady, setServerReady] = useState(false);
  const [state, setState] = useState<"checking" | "idle" | "connecting" | "success" | "error">("checking");
  const [message, setMessage] = useState("Verificando a conexão oficial da Meta...");
  const popupRef = useRef<Window | null>(null);
  const nonceRef = useRef("");
  const finalizingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!publicConfigured) {
        setState("error");
        setMessage("A configuração pública da Meta não foi encontrada neste ambiente.");
        return;
      }

      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
        if (!data.session?.access_token || !apiUrl) throw new Error("A sessão do Kavro ou o endereço da API está ausente.");
        const response = await fetch(`${apiUrl}/v1/whatsapp/readiness`, {
          headers: { authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(await readErrorMessage(response));
        const readiness = await response.json() as Readiness;
        const problem = describeReadiness(readiness);
        if (!active) return;
        if (problem) {
          setState("error");
          setMessage(problem);
          return;
        }
        setServerReady(true);
        setState("idle");
        setMessage("Tudo pronto. A conexão será feita em uma janela segura do Kavro e da Meta.");
      } catch (error) {
        if (!active) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível verificar a configuração oficial.");
      }
    };
    void check();
    return () => { active = false; };
  }, [publicConfigured]);

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
      popupRef.current?.postMessage({ type: "KAVRO_META_SIGNUP_ACK", nonce: nonceRef.current }, window.location.origin);
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
        popupRef.current?.close();
        popupRef.current = null;
        setState("success");
        setMessage("WhatsApp conectado com sucesso. Atualizando...");
        window.setTimeout(() => window.location.assign("/app/whatsapp/settings"), 900);
      } catch (error) {
        popupRef.current?.close();
        popupRef.current = null;
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
        setMessage("A janela de conexão foi fechada antes da conclusão. Tente novamente.");
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
    if (!publicConfigured || !serverReady) {
      setState("error");
      setMessage("A conexão oficial ainda não está completamente configurada neste ambiente.");
      return;
    }

    finalizingRef.current = false;
    nonceRef.current = createNonce();
    const width = 620;
    const height = 760;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);

    // Abrimos primeiro uma janela vazia, dentro do gesto do clique. Depois apontamos
    // para a rota do Kavro. Esse formato é o mais resistente a bloqueadores de pop-up.
    const popup = window.open(
      "about:blank",
      `kavro_meta_auth_${nonceRef.current}`,
      `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      setState("error");
      setMessage("O navegador bloqueou a janela de conexão. Libere pop-ups para este site e tente novamente.");
      return;
    }

    popupRef.current = popup;
    const authUrl = new URL("/meta/auth", window.location.origin);
    authUrl.searchParams.set("nonce", nonceRef.current);
    popup.location.replace(authUrl.toString());
    popup.focus();
    setState("connecting");
    setMessage("A janela segura do Kavro foi aberta. Continue nela para entrar com a Meta.");
  };

  const disabled = !publicConfigured || !serverReady || state === "checking" || state === "connecting" || state === "success";
  const label = state === "checking"
    ? "Verificando configuração..."
    : state === "connecting"
      ? "Aguardando a Meta..."
      : state === "success"
        ? "Conectado"
        : "Continuar com a Meta";

  return <>
    <button className="meta-connect-button" type="button" onClick={connect} disabled={disabled}>
      {label}
    </button>
    {message ? <small className={`availability-note ${state}`}>{message}</small> : null}
  </>;
}

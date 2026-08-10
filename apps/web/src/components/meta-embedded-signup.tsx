"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SignupData = {
  phoneNumberId: string;
  businessAccountId: string;
};

type FacebookLoginResponse = {
  authResponse?: { code?: string };
  status?: string;
};

type FacebookSdk = {
  init(options: Record<string, unknown>): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>
  ): void;
};

type Readiness = {
  canManage?: boolean;
  official?: {
    metaAppConfigured?: boolean;
    credentialVaultConfigured?: boolean;
    webhookConfigured?: boolean;
  };
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

function parseSignupPayload(value: unknown): SignupData | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as {
    event?: string;
    data?: {
      phone_number_id?: string;
      waba_id?: string;
    };
  };
  if (payload.event !== "FINISH" || !payload.data?.phone_number_id || !payload.data?.waba_id) return null;
  return {
    phoneNumberId: payload.data.phone_number_id,
    businessAccountId: payload.data.waba_id
  };
}

function loadFacebookSdk(appId: string) {
  return new Promise<FacebookSdk>((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v25.0" });
      resolve(window.FB);
      return;
    }

    const timeout = window.setTimeout(() => reject(new Error("A Meta demorou para carregar. Atualize a página e tente novamente.")), 15000);
    const finish = () => {
      if (!window.FB) return;
      window.clearTimeout(timeout);
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v25.0" });
      resolve(window.FB);
    };

    window.fbAsyncInit = finish;
    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar a conexão oficial da Meta.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Não foi possível carregar a conexão oficial da Meta."));
    };
    document.head.appendChild(script);
  });
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
  const [sdk, setSdk] = useState<FacebookSdk | null>(null);
  const [serverReady, setServerReady] = useState(false);
  const [state, setState] = useState<"checking" | "idle" | "connecting" | "success" | "error">("checking");
  const [message, setMessage] = useState("Verificando a conexão oficial da Meta...");
  const codeRef = useRef("");
  const signupRef = useRef<SignupData | null>(null);
  const finalizingRef = useRef(false);
  const attemptTimeoutRef = useRef<number | null>(null);

  const clearAttemptTimeout = useCallback(() => {
    if (attemptTimeoutRef.current !== null) {
      window.clearTimeout(attemptTimeoutRef.current);
      attemptTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const prepare = async () => {
      if (!appId || !configId) {
        setState("error");
        setMessage("A configuração pública da Meta não foi encontrada neste ambiente.");
        return;
      }

      try {
        const sdkPromise = loadFacebookSdk(appId);
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
        if (problem) throw new Error(problem);
        const loadedSdk = await sdkPromise;
        if (!active) return;
        setSdk(loadedSdk);
        setServerReady(true);
        setState("idle");
        setMessage("Tudo pronto. Clique para abrir diretamente a janela oficial da Meta.");
      } catch (error) {
        if (!active) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível verificar a configuração oficial.");
      }
    };
    void prepare();
    return () => { active = false; };
  }, [appId, configId]);

  const finishWhenComplete = useCallback(async () => {
    if (finalizingRef.current || !codeRef.current || !signupRef.current) return;
    finalizingRef.current = true;
    clearAttemptTimeout();
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
          code: codeRef.current,
          phoneNumberId: signupRef.current.phoneNumberId,
          businessAccountId: signupRef.current.businessAccountId
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
  }, [clearAttemptTimeout]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (!payload || typeof payload !== "object") return;
      const envelope = payload as { type?: string; event?: string };
      if (envelope.type !== "WA_EMBEDDED_SIGNUP") return;

      if (envelope.event === "CANCEL" || envelope.event === "ERROR") {
        clearAttemptTimeout();
        setState("error");
        setMessage(envelope.event === "CANCEL" ? "A conexão foi cancelada. Você pode tentar novamente." : "A Meta não concluiu a conexão. Tente novamente.");
        return;
      }

      const signup = parseSignupPayload(payload);
      if (!signup) return;
      signupRef.current = signup;
      void finishWhenComplete();
    };

    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [clearAttemptTimeout, finishWhenComplete]);

  useEffect(() => () => clearAttemptTimeout(), [clearAttemptTimeout]);

  const connect = () => {
    if (!publicConfigured || !serverReady || !sdk || !configId) {
      setState("error");
      setMessage("A conexão oficial ainda não está completamente configurada neste ambiente.");
      return;
    }

    clearAttemptTimeout();
    codeRef.current = "";
    signupRef.current = null;
    finalizingRef.current = false;
    setState("connecting");
    setMessage("A janela oficial da Meta foi aberta. Conclua as etapas nela.");
    attemptTimeoutRef.current = window.setTimeout(() => {
      if (finalizingRef.current) return;
      setState("error");
      setMessage("A Meta não concluiu a autorização. Feche qualquer janela aberta e tente novamente.");
    }, 5 * 60 * 1000);

    try {
      // A chamada precisa ocorrer diretamente dentro do clique. Assim o navegador
      // reconhece o gesto do usuário e não bloqueia o pop-up oficial da Meta.
      sdk.login((response) => {
        const code = response.authResponse?.code;
        if (!code) {
          clearAttemptTimeout();
          setState("error");
          setMessage("A Meta não devolveu a autorização. Se você cancelou, tente novamente.");
          return;
        }
        codeRef.current = code;
        void finishWhenComplete();
      }, {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        display: "popup",
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          features: [{ name: "marketing_messages_lite" }],
          sessionInfoVersion: "3"
        }
      });
    } catch (error) {
      clearAttemptTimeout();
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir a janela oficial da Meta.");
    }
  };

  const disabled = !publicConfigured || !serverReady || !sdk || state === "checking" || state === "connecting" || state === "success";
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SignupData = {
  phoneNumberId: string;
  businessAccountId: string;
};

type FacebookResponse = { authResponse?: { code?: string }; status?: string };
type FacebookSdk = {
  init(options: Record<string, unknown>): void;
  login(callback: (response: FacebookResponse) => void, options: Record<string, unknown>): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

function parseSignupPayload(payload: unknown) {
  let parsed = payload;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as {
    type?: string;
    event?: string;
    data?: { phone_number_id?: string; waba_id?: string; error_message?: string };
  };
}

function loadFacebookSdk(appId: string) {
  return new Promise<FacebookSdk>((resolve, reject) => {
    const initialize = () => {
      if (!window.FB) return false;
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v25.0" });
      resolve(window.FB);
      return true;
    };

    if (initialize()) return;
    window.fbAsyncInit = () => { initialize(); };
    let script = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      document.body.appendChild(script);
    }
    script.addEventListener("load", () => { initialize(); }, { once: true });
    script.addEventListener("error", () => reject(new Error("O SDK oficial da Meta foi bloqueado pelo navegador.")), { once: true });
    window.setTimeout(() => {
      if (!window.FB) reject(new Error("A Meta demorou demais para responder."));
    }, 15000);
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

export function MetaEmbeddedSignup() {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const configured = Boolean(appId && configId);
  const [sdk, setSdk] = useState<FacebookSdk | null>(null);
  const [state, setState] = useState<"preparing" | "ready" | "connecting" | "success" | "error">(configured ? "preparing" : "error");
  const [message, setMessage] = useState(configured ? "Preparando a conexão oficial da Meta..." : "A configuração pública da Meta não foi encontrada neste ambiente.");
  const codeRef = useRef("");
  const signupRef = useRef<SignupData | null>(null);
  const finalizingRef = useRef(false);

  useEffect(() => {
    if (!appId || !configId) return;
    let active = true;
    loadFacebookSdk(appId)
      .then((loaded) => {
        if (!active) return;
        setSdk(loaded);
        setState("ready");
        setMessage("Tudo pronto. Clique para abrir a janela oficial da Meta.");
      })
      .catch((error) => {
        if (!active) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar a Meta.");
      });
    return () => { active = false; };
  }, [appId, configId]);

  const finishWhenComplete = useCallback(async () => {
    const signup = signupRef.current;
    const code = codeRef.current;
    if (!signup || !code || finalizingRef.current) return;

    finalizingRef.current = true;
    setState("connecting");
    setMessage("Autorização recebida. Validando e protegendo a conexão...");

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
          code,
          phoneNumberId: signup.phoneNumberId,
          businessAccountId: signup.businessAccountId
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
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      const payload = parseSignupPayload(event.data);
      if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") return;

      if (payload.event === "FINISH" && payload.data?.phone_number_id && payload.data.waba_id) {
        signupRef.current = {
          phoneNumberId: payload.data.phone_number_id,
          businessAccountId: payload.data.waba_id
        };
        setMessage("Número selecionado. Finalizando a autorização...");
        void finishWhenComplete();
      } else if (payload.event === "CANCEL") {
        setState("ready");
        setMessage("A configuração foi cancelada. Você pode tentar novamente.");
      } else if (payload.event === "ERROR") {
        setState("ready");
        setMessage(payload.data?.error_message || "A Meta não concluiu a configuração. Tente novamente.");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [finishWhenComplete]);

  const connect = () => {
    if (!sdk || !configId) {
      setState("error");
      setMessage("A conexão oficial da Meta ainda não terminou de carregar. Atualize a página e tente novamente.");
      return;
    }

    codeRef.current = "";
    signupRef.current = null;
    finalizingRef.current = false;
    setState("connecting");
    setMessage("Conclua as etapas na janela oficial da Meta.");

    // Esta chamada precisa permanecer diretamente dentro do clique do usuário.
    // Qualquer await antes dela faz navegadores tratarem a janela como pop-up indevido.
    sdk.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setState("ready");
        setMessage("O acesso não foi autorizado ou a janela foi fechada. Tente novamente.");
        return;
      }
      codeRef.current = code;
      setMessage("Acesso autorizado. Aguardando a seleção do número...");
      void finishWhenComplete();
    }, {
      config_id: configId,
      display: "popup",
      auth_type: "rerequest",
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        features: [{ name: "marketing_messages_lite" }],
        sessionInfoVersion: "3"
      }
    });
  };

  const buttonLabel = state === "preparing"
    ? "Preparando a Meta..."
    : state === "connecting"
      ? "Aguardando a Meta..."
      : state === "success"
        ? "Conectado"
        : "Continuar com a Meta";

  return <>
    <button
      className="meta-connect-button"
      type="button"
      onClick={connect}
      disabled={!configured || state === "preparing" || state === "connecting" || state === "success"}
    >
      {buttonLabel}
    </button>
    {message ? <small className={`availability-note ${state}`}>{message}</small> : null}
  </>;
}

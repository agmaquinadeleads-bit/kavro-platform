"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SignupData = { phoneNumberId: string; businessAccountId: string };
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
    script.addEventListener("error", () => reject(new Error("O SDK da Meta foi bloqueado pelo navegador.")), { once: true });
    window.setTimeout(() => {
      if (!window.FB) reject(new Error("A Meta demorou demais para responder."));
    }, 15000);
  });
}

export function MetaAuthPopup({ nonce }: { nonce: string }) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const inputError = !nonce || nonce.length < 16
    ? "Esta tentativa de conexão expirou. Feche a janela e tente novamente no Kavro."
    : !appId || !configId
      ? "A configuração pública da Meta não está disponível neste ambiente."
      : "";
  const [sdk, setSdk] = useState<FacebookSdk | null>(null);
  const [state, setState] = useState<"preparing" | "ready" | "connecting" | "error">(inputError ? "error" : "preparing");
  const [message, setMessage] = useState(inputError || "Preparando a conexão segura...");
  const codeRef = useRef("");
  const signupRef = useRef<SignupData | null>(null);
  const completedRef = useRef(false);

  const notifyOpener = useCallback((payload: Record<string, unknown>) => {
    if (!window.opener || window.opener.closed) return false;
    window.opener.postMessage({ ...payload, nonce }, window.location.origin);
    return true;
  }, [nonce]);

  const finishWhenComplete = useCallback(() => {
    const signup = signupRef.current;
    const code = codeRef.current;
    if (!signup || !code || completedRef.current) return;
    completedRef.current = true;
    setMessage("Autorização concluída. Retornando ao Kavro...");
    notifyOpener({ type: "KAVRO_META_SIGNUP_COMPLETE", code, ...signup });
    window.setTimeout(() => window.close(), 350);
  }, [notifyOpener]);

  useEffect(() => {
    if (inputError) return;
    if (!window.opener || window.opener.closed) {
      const timeout = window.setTimeout(() => {
        setState("error");
        setMessage("Abra esta conexão pelo botão dentro do Kavro.");
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    if (!appId) {
      return;
    }

    let active = true;
    loadFacebookSdk(appId)
      .then((loaded) => {
        if (!active) return;
        setSdk(loaded);
        setState("ready");
        setMessage("Clique abaixo para abrir o acesso oficial da Meta.");
      })
      .catch((error) => {
        if (!active) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar a Meta.");
      });
    return () => { active = false; };
  }, [appId, inputError]);

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
        finishWhenComplete();
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

  const login = () => {
    if (!sdk || !configId) return;
    codeRef.current = "";
    signupRef.current = null;
    completedRef.current = false;
    setState("connecting");
    setMessage("Conclua as etapas na janela oficial da Meta.");

    sdk.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setState("ready");
        setMessage("O acesso não foi autorizado. Você pode tentar novamente.");
        return;
      }
      codeRef.current = code;
      setMessage("Acesso autorizado. Aguardando a seleção do número...");
      finishWhenComplete();
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

  const retry = () => window.location.reload();

  return <main className="meta-auth-page">
    <section className="meta-auth-card">
      <div className="setup-logo"><span>K</span>Kavro</div>
      <p className="eyebrow">CONEXÃO OFICIAL</p>
      <h1>WhatsApp Business</h1>
      <p>Você está em uma janela segura do Kavro. O acesso seguinte é feito diretamente pela Meta.</p>
      <div className="meta-auth-shield" aria-hidden="true">✓</div>
      <strong>{state === "connecting" ? "Conectando com a Meta" : state === "error" ? "A conexão precisa de atenção" : "Tudo pronto para continuar"}</strong>
      <small>{message}</small>
      {state === "error"
        ? <button type="button" className="secondary" onClick={retry}>Tentar carregar novamente</button>
        : <button type="button" onClick={login} disabled={state !== "ready"}>{state === "preparing" ? "Preparando..." : state === "connecting" ? "Aguardando a Meta..." : "Continuar com o Facebook"}</button>}
      <button type="button" className="link-button" onClick={() => window.close()}>Cancelar</button>
    </section>
  </main>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SignupData = { phoneNumberId: string; businessAccountId: string };
type FacebookResponse = { authResponse?: { code?: string } };
type FacebookSdk = { init(options: Record<string, unknown>): void; login(callback: (response: FacebookResponse) => void, options: Record<string, unknown>): void };

declare global { interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void } }

export function MetaEmbeddedSignup() {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"idle" | "connecting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const signup = useRef<SignupData | null>(null);
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let payload: unknown = event.data;
      if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { return; } }
      const data = payload as { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string } };
      if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH" && data.data?.phone_number_id && data.data.waba_id) {
        signup.current = { phoneNumberId: data.data.phone_number_id, businessAccountId: data.data.waba_id };
      }
    };
    window.addEventListener("message", receive);
    if (!appId || !configId) return () => window.removeEventListener("message", receive);
    window.fbAsyncInit = () => { window.FB?.init({ appId, cookie: true, xfbml: false, version: "v23.0" }); setReady(true); };
    if (window.FB) window.fbAsyncInit();
    else { const script = document.createElement("script"); script.id = "facebook-jssdk"; script.async = true; script.defer = true; script.crossOrigin = "anonymous"; script.src = "https://connect.facebook.net/pt_BR/sdk.js"; document.body.appendChild(script); }
    return () => window.removeEventListener("message", receive);
  }, [appId, configId]);

  const connect = () => {
    if (!window.FB || !configId) return;
    signup.current = null; setState("connecting"); setMessage("Conclua as etapas na janela segura da Meta.");
    window.FB.login(async (response) => {
      const code = response.authResponse?.code;
      const selected = signup.current;
      if (!code || !selected) { setState("error"); setMessage("A conexão não foi concluída. Tente novamente."); return; }
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
        if (!data.session?.access_token || !apiUrl) throw new Error("Configuração ausente");
        const result = await fetch(`${apiUrl}/v1/whatsapp/meta/onboarding`, { method: "POST", headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ code, ...selected }) });
        if (!result.ok) throw new Error("Falha ao confirmar");
        setState("success"); setMessage("WhatsApp conectado com sucesso. Atualizando...");
        window.setTimeout(() => window.location.assign("/app/whatsapp/settings"), 900);
      } catch { setState("error"); setMessage("Não foi possível confirmar a conexão. Tente novamente."); }
    }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
  };

  return <><button type="button" onClick={connect} disabled={!ready || state === "connecting"}>{state === "connecting" ? "Conectando..." : "Continuar com a Meta"}</button>{message ? <small className={`availability-note ${state}`}>{message}</small> : null}</>;
}

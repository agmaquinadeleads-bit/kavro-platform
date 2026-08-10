"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SignupData = { phoneNumberId: string; businessAccountId: string };
type FacebookResponse = { authResponse?: { code?: string } };
type FacebookSdk = { init(options: Record<string, unknown>): void; login(callback: (response: FacebookResponse) => void, options: Record<string, unknown>): void };

declare global { interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void } }

export function MetaEmbeddedSignup() {
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
    return () => window.removeEventListener("message", receive);
  }, []);

  const loadSdk = () => new Promise<FacebookSdk>((resolve, reject) => {
    if (!appId) { reject(new Error("App ID ausente")); return; }
    const initialize = () => {
      if (!window.FB) return false;
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v23.0" });
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
    script.addEventListener("error", () => reject(new Error("SDK bloqueado")), { once: true });
    window.setTimeout(() => { if (!window.FB) reject(new Error("Tempo esgotado")); }, 12000);
  });

  const connect = async () => {
    if (!appId || !configId) { setState("error"); setMessage("A configuração pública da Meta não foi encontrada neste ambiente."); return; }
    signup.current = null; setState("connecting"); setMessage("Conclua as etapas na janela segura da Meta.");
    let facebook: FacebookSdk;
    try { facebook = await loadSdk(); }
    catch { setState("error"); setMessage("O navegador bloqueou a conexão com a Meta. Libere pop-ups e tente novamente."); return; }
    facebook.login(async (response) => {
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

  return <><button type="button" onClick={connect} disabled={state === "connecting"}>{state === "connecting" ? "Conectando..." : "Continuar com a Meta"}</button>{message ? <small className={`availability-note ${state}`}>{message}</small> : null}</>;
}

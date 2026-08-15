"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FacebookLoginResponse = { authResponse?: { code?: string }; status?: string };
type FacebookSdk = { init(options: Record<string, unknown>): void; login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void };

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

type PageOption = { pageId: string; pageName: string; hasInstagram: boolean; instagramUsername: string | null };

// Permissões pra publicar de verdade (não é o mesmo fluxo de Embedded
// Signup usado pro WhatsApp — aqui é um login padrão da Meta pedindo
// esses escopos específicos).
const SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management";

// Duplicado de apps/web/src/components/meta-embedded-signup.tsx de
// propósito — os dois módulos (WhatsApp e Conteúdo) devem poder evoluir
// e, no futuro, ser vendidos separadamente sem dependerem um do outro.
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
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar a conexão com a Meta.")), { once: true });
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
      reject(new Error("Não foi possível carregar a conexão com a Meta."));
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
    // Resposta sem corpo JSON — segue com a mensagem genérica abaixo.
  }
  return "Não foi possível confirmar a conexão com a Meta.";
}

type State = "checking" | "idle" | "connecting" | "selecting" | "confirming" | "success" | "error";

export function SocialConnectButton({ brandId }: { brandId: string }) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const [sdk, setSdk] = useState<FacebookSdk | null>(null);
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("Verificando configuração da Meta...");
  const [selectionToken, setSelectionToken] = useState("");
  const [pages, setPages] = useState<PageOption[]>([]);
  const [chosenPageId, setChosenPageId] = useState("");
  const [wantsInstagram, setWantsInstagram] = useState(false);
  const [wantsFacebook, setWantsFacebook] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!appId) {
        setState("error");
        setMessage("A configuração pública da Meta não foi encontrada neste ambiente.");
        return;
      }
      try {
        const loadedSdk = await loadFacebookSdk(appId);
        if (!active) return;
        setSdk(loadedSdk);
        setState("idle");
        setMessage("");
      } catch (error) {
        if (!active) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar a conexão com a Meta.");
      }
    })();
    return () => { active = false; };
  }, [appId]);

  const apiRequest = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!data.session?.access_token || !apiUrl) throw new Error("A sessão do Kavro ou o endereço da API está ausente.");
    return { apiUrl, headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" } };
  }, []);

  const handleCode = useCallback(async (code: string) => {
    setState("connecting");
    setMessage("Buscando as páginas que você gerencia...");
    try {
      const { apiUrl, headers } = await apiRequest();
      const response = await fetch(`${apiUrl}/v1/social/connect/list-pages`, {
        method: "POST",
        headers,
        body: JSON.stringify({ code, redirectUri: window.location.href })
      });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const body = await response.json() as { selectionToken: string; pages: PageOption[] };
      if (!body.pages.length) {
        setState("error");
        setMessage("Nenhuma página do Facebook foi encontrada nessa conta.");
        return;
      }
      setSelectionToken(body.selectionToken);
      setPages(body.pages);
      setChosenPageId(body.pages[0]?.pageId ?? "");
      setWantsInstagram(Boolean(body.pages[0]?.hasInstagram));
      setWantsFacebook(true);
      setState("selecting");
      setMessage("");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível buscar as páginas.");
    }
  }, [apiRequest]);

  const connect = () => {
    if (!sdk) return;
    setState("connecting");
    setMessage("A janela da Meta foi aberta. Conclua o login e autorize o acesso.");
    try {
      // A chamada precisa ocorrer diretamente dentro do clique, senão o
      // navegador bloqueia o pop-up (mesmo cuidado de meta-embedded-signup.tsx).
      sdk.login((response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setState("error");
          setMessage("A Meta não retornou autorização. Se você cancelou, tente novamente.");
          return;
        }
        void handleCode(code);
      }, { scope: SCOPES, response_type: "code", override_default_response_type: true });
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir a janela da Meta.");
    }
  };

  const confirmSelection = async () => {
    if (!chosenPageId || (!wantsInstagram && !wantsFacebook)) return;
    setState("confirming");
    setMessage("Confirmando conexão...");
    try {
      const { apiUrl, headers } = await apiRequest();
      const providers: Array<"instagram" | "facebook"> = [
        ...(wantsFacebook ? (["facebook"] as const) : []),
        ...(wantsInstagram ? (["instagram"] as const) : [])
      ];
      for (const provider of providers) {
        const response = await fetch(`${apiUrl}/v1/social/connect/complete`, {
          method: "POST",
          headers,
          body: JSON.stringify({ selectionToken, brandId, pageId: chosenPageId, provider })
        });
        if (!response.ok) throw new Error(await readErrorMessage(response));
      }
      setState("success");
      setMessage("Conectado com sucesso. Atualizando...");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível confirmar a conexão.");
    }
  };

  const chosenPage = pages.find((page) => page.pageId === chosenPageId);

  if (state === "selecting") {
    return (
      <div className="social-connect-selection">
        <label>
          Página do Facebook
          <select value={chosenPageId} onChange={(event) => {
            const nextPageId = event.target.value;
            setChosenPageId(nextPageId);
            setWantsInstagram(Boolean(pages.find((page) => page.pageId === nextPageId)?.hasInstagram));
          }}>
            {pages.map((page) => <option key={page.pageId} value={page.pageId}>{page.pageName}</option>)}
          </select>
        </label>
        <div className="social-connect-providers">
          <label>
            <input type="checkbox" checked={wantsFacebook} onChange={(event) => setWantsFacebook(event.target.checked)} />
            Facebook
          </label>
          <label>
            <input
              type="checkbox"
              disabled={!chosenPage?.hasInstagram}
              checked={wantsInstagram}
              onChange={(event) => setWantsInstagram(event.target.checked)}
            />
            Instagram {chosenPage?.hasInstagram ? (chosenPage.instagramUsername ? `(@${chosenPage.instagramUsername})` : "") : "(sem conta comercial vinculada)"}
          </label>
        </div>
        {message ? <small className="availability-note error">{message}</small> : null}
        <div className="social-connect-actions">
          <button type="button" className="btn-secondary" onClick={() => setState("idle")}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => void confirmSelection()} disabled={!wantsInstagram && !wantsFacebook}>
            Conectar
          </button>
        </div>
      </div>
    );
  }

  const disabled = state === "checking" || state === "connecting" || state === "confirming" || state === "success" || !sdk;
  const label = state === "checking"
    ? "Verificando..."
    : state === "connecting"
      ? "Aguardando a Meta..."
      : state === "confirming"
        ? "Confirmando..."
        : state === "success"
          ? "Conectado"
          : "Conectar Instagram/Facebook";

  return (
    <div className="social-connect">
      <button type="button" className="btn-secondary" onClick={connect} disabled={disabled}>{label}</button>
      {message ? <small className={`availability-note ${state}`}>{message}</small> : null}
    </div>
  );
}

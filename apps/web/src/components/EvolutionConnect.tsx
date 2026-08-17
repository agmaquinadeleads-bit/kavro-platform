"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CreateConnectionResponse = { connectionId: string; qrCode: string | null; status: string };
type StatusResponse = { status: string };

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json() as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(" ");
    if (typeof body.message === "string") return body.message;
  } catch {
    // A resposta pode não conter JSON. Nesse caso usamos a mensagem segura abaixo.
  }
  return "Não foi possível conectar por QR Code.";
}

function qrImageSrc(qrCode: string) {
  return qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`;
}

// Mesmo padrão de meta-embedded-signup.tsx: sessão do browser via Supabase
// client, bearer token direto pra API do Kavro (nunca expõe a Evolution
// pro navegador). Diferença é que aqui não tem OAuth — só criar a conexão
// e esperar o QR ser lido (polling de status).
export function EvolutionConnect() {
  const [displayName, setDisplayName] = useState("");
  const [state, setState] = useState<"idle" | "creating" | "waiting" | "connected" | "error">("idle");
  const [message, setMessage] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const failureStreakRef = useRef(0);

  const clearPoll = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const pollStatus = useCallback(async () => {
    const connectionId = connectionIdRef.current;
    if (!connectionId) return;

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
      if (!data.session?.access_token || !apiUrl) throw new Error("A sessão do Kavro ou o endereço da API está ausente.");

      const response = await fetch(`${apiUrl}/v1/whatsapp/evolution/connections/${connectionId}/status`, {
        headers: { authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const body = await response.json() as StatusResponse;

      if (body.status === "connected") {
        failureStreakRef.current = 0;
        setState("connected");
        setMessage("WhatsApp conectado com sucesso. Atualizando...");
        window.setTimeout(() => window.location.assign("/app/whatsapp/settings"), 900);
        return;
      }
      if (body.status === "error" || body.status === "disconnected") {
        failureStreakRef.current += 1;
        // Só desiste depois de falhas seguidas — um único status ruim logo
        // após gerar o QR pode ser só a Evolution ainda de inicializando a
        // instância, não uma falha de verdade.
        if (failureStreakRef.current >= 3) {
          setState("error");
          setMessage("A conexão caiu antes de terminar. Gere um novo QR Code e tente de novo.");
          return;
        }
      } else {
        failureStreakRef.current = 0;
      }

      pollTimeoutRef.current = window.setTimeout(() => void pollStatus(), 3000);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível checar o status da conexão.");
    }
  }, []);

  const createConnection = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setState("error");
      setMessage("Dê um nome pra essa conexão (ex: WhatsApp Principal).");
      return;
    }

    clearPoll();
    failureStreakRef.current = 0;
    setState("creating");
    setMessage("Gerando o QR Code...");
    setQrCode(null);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
      if (!data.session?.access_token || !apiUrl) throw new Error("A sessão do Kavro ou o endereço da API está ausente.");

      const response = await fetch(`${apiUrl}/v1/whatsapp/evolution/connections`, {
        method: "POST",
        headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ displayName: trimmedName })
      });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const body = await response.json() as CreateConnectionResponse;
      if (!body.qrCode) throw new Error("A Evolution não devolveu um QR Code. Tente novamente.");

      connectionIdRef.current = body.connectionId;
      setQrCode(body.qrCode);
      setState("waiting");
      setMessage("Abra o WhatsApp no celular, vá em Aparelhos conectados e leia o QR Code abaixo.");
      pollTimeoutRef.current = window.setTimeout(() => void pollStatus(), 3000);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o QR Code.");
    }
  };

  if (state === "idle" || state === "error") {
    return (
      <div className="evolution-connect">
        <label>
          Nome dessa conexão
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Ex: WhatsApp Principal"
            maxLength={100}
          />
        </label>
        <button type="button" onClick={() => void createConnection()}>Gerar QR Code</button>
        {message ? <small className="availability-note error">{message}</small> : null}
      </div>
    );
  }

  return (
    <div className="evolution-connect">
      {qrCode ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrImageSrc(qrCode)} alt="QR Code do WhatsApp" className="evolution-qr-image" />
      ) : null}
      <small className={`availability-note ${state}`}>{message}</small>
    </div>
  );
}

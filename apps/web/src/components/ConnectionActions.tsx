"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ConnectionActionsProps = {
  connectionId: string;
  provider: string;
  status: string;
};

type QrResponse = { qrCode: string | null };

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json() as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(" ");
    if (typeof body.message === "string") return body.message;
  } catch {
    // Sem corpo JSON — usa a mensagem genérica abaixo.
  }
  return "Não foi possível completar a ação.";
}

function qrImageSrc(qrCode: string) {
  return qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`;
}

async function authHeader() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!data.session?.access_token || !apiUrl) throw new Error("A sessão do Kavro ou o endereço da API está ausente.");
  return { apiUrl, headers: { authorization: `Bearer ${data.session.access_token}` } };
}

// Ações de gerenciamento por conexão (excluir / gerar QR novo) — v1 do
// fluxo de conexão só criava, não dava pra limpar tentativas que
// ficaram presas em "Aguardando QR".
export function ConnectionActions({ connectionId, provider, status }: ConnectionActionsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm("Remover essa conexão? As conversas ligadas a ela também serão apagadas.")) return;
    setBusy(true);
    setError("");
    try {
      const { apiUrl, headers } = await authHeader();
      const response = await fetch(`${apiUrl}/v1/whatsapp/connections/${connectionId}`, { method: "DELETE", headers });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      window.location.reload();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Não foi possível remover a conexão.");
    }
  };

  const handleRegenerateQr = async () => {
    setBusy(true);
    setError("");
    setQrCode(null);
    try {
      const { apiUrl, headers } = await authHeader();
      const response = await fetch(`${apiUrl}/v1/whatsapp/evolution/connections/${connectionId}/qr`, {
        method: "POST",
        headers
      });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const body = await response.json() as QrResponse;
      if (!body.qrCode) throw new Error("A Evolution não devolveu um QR Code novo.");
      setQrCode(body.qrCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar um QR Code novo.");
    } finally {
      setBusy(false);
    }
  };

  const canRegenerateQr = provider === "evolution" && status !== "connected";

  return (
    <div className="connection-actions">
      <div className="connection-actions-buttons">
        {canRegenerateQr ? (
          <button type="button" className="link-button" onClick={() => void handleRegenerateQr()} disabled={busy}>
            Ler QR novamente
          </button>
        ) : null}
        <button type="button" className="link-button danger" onClick={() => void handleDelete()} disabled={busy}>
          Excluir
        </button>
      </div>
      {error ? <small className="availability-note error">{error}</small> : null}
      {qrCode ? (
        <div className="connection-actions-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImageSrc(qrCode)} alt="QR Code do WhatsApp" className="evolution-qr-image" />
          <small className="availability-note">Escaneia e depois atualiza a página.</small>
        </div>
      ) : null}
    </div>
  );
}

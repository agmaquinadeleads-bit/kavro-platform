"use client";

import { useEffect, useState } from "react";

const CURRENT_SIGNUP_URL = "/app/whatsapp/settings?method=official&flow=direct";

export function MetaAuthPopup() {
  const [manualRecovery, setManualRecovery] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.opener && !window.opener.closed) {
        window.opener.location.replace(CURRENT_SIGNUP_URL);
        window.close();
        window.setTimeout(() => setManualRecovery(true), 500);
        return;
      }

      window.location.replace(CURRENT_SIGNUP_URL);
    }, 700);

    return () => window.clearTimeout(timer);
  }, []);

  const recover = () => {
    if (window.opener && !window.opener.closed) {
      window.opener.location.replace(CURRENT_SIGNUP_URL);
      window.close();
      return;
    }
    window.location.replace(CURRENT_SIGNUP_URL);
  };

  return <main className="meta-auth-page">
    <section className="meta-auth-card">
      <div className="setup-logo"><span>K</span>Kavro</div>
      <p className="eyebrow">CONEXÃO OFICIAL</p>
      <h1>Atualizando a conexão</h1>
      <p>Uma versão mais nova do acesso à Meta está disponível. O Kavro está atualizando esta tela automaticamente.</p>
      <div className="meta-auth-shield" aria-hidden="true">✓</div>
      <strong>Aguarde um instante...</strong>
      {manualRecovery ? <button type="button" className="button" onClick={recover}>Continuar no Kavro</button> : null}
    </section>
  </main>;
}

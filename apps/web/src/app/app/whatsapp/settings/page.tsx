import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function WhatsappSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app");
  const { data: membership } = await supabase.from("organization_members").select("org_id, role").eq("user_id", user.id).maybeSingle();
  if (!membership) redirect("/onboarding");
  if (membership.role === "member") redirect("/app/whatsapp");
  const { data: connections } = await supabase.from("whatsapp_connections").select("id, display_name, phone_number, provider, status, is_default, last_synced_at").eq("org_id", membership.org_id).order("created_at");
  return <main className="centered-page"><section className="setup-card whatsapp-settings-card"><div className="setup-logo"><span>K</span>Kavro</div><Link className="settings-back" href="/app/whatsapp">← Voltar às conversas</Link><p className="eyebrow">INTEGRAÇÕES</p><h1>WhatsApp</h1><p>As credenciais serão guardadas somente no backend. Nenhuma chave será salva no navegador ou exibida nesta tela.</p>{connections?.length ? <div className="connection-list">{connections.map((connection) => <article key={connection.id}><div><strong>{connection.display_name}</strong><small>{connection.phone_number || "Telefone aguardando conexão"}</small></div><span className={connection.status}>{connection.status === "connected" ? "Conectado" : connection.status === "connecting" ? "Conectando" : connection.status === "qr_code" ? "Aguardando QR" : connection.status === "error" ? "Erro" : "Desconectado"}</span></article>)}</div> : <div className="connection-onboarding"><strong>Backend preparado</strong><p>Para liberar o botão de conexão, precisamos confirmar onde sua Evolution está hospedada e qual versão está instalada.</p><button disabled>Conectar número</button></div>}<div className="security-note">A produção atual não será desconectada durante a preparação da homologação.</div></section></main>;
}

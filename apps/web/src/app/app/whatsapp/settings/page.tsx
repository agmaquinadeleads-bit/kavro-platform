import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { MetaEmbeddedSignup } from "@/components/meta-embedded-signup";

type Props = { searchParams: Promise<{ method?: string }> };

export default async function WhatsappSettingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, orgId, role } = await getAuthContext();
  if (role === "member") redirect("/app/whatsapp");
  const { data: connections } = await supabase.from("whatsapp_connections").select("id, display_name, phone_number, provider, status").eq("org_id", orgId).order("created_at");
  const method = params.method === "official" || params.method === "qr" ? params.method : null;

  return <main className="centered-page"><section className="setup-card whatsapp-settings-card">
    <div className="setup-logo"><span>K</span>Kavro</div><Link className="settings-back" href="/app/whatsapp">← Voltar às conversas</Link>
    <p className="eyebrow">CANAIS DE ATENDIMENTO</p><h1>Conectar WhatsApp</h1><p>Escolha como deseja usar seu número. O Kavro cuida da configuração técnica e nunca exibe suas credenciais.</p>
    {connections?.length ? <div className="connection-list">{connections.map((connection) => <article key={connection.id}><div><strong>{connection.display_name}</strong><small>{connection.phone_number || "Telefone aguardando conexão"} · {connection.provider === "whatsapp_cloud" ? "Meta Oficial" : "QR Code"}</small></div><span className={connection.status}>{connection.status === "connected" ? "Conectado" : connection.status === "connecting" ? "Configurando" : connection.status === "qr_code" ? "Aguardando QR" : connection.status === "error" ? "Precisa de atenção" : "Desconectado"}</span></article>)}</div> : null}
    {!method ? <div className="connection-methods">
      <article className="recommended"><span className="method-badge">RECOMENDADO</span><div className="method-icon">M</div><h2>WhatsApp Oficial da Meta</h2><p>Mais estabilidade, atribuição de campanhas e envio de vendas ao Meta Ads.</p><ul><li>Configuração guiada pela Meta</li><li>Sem copiar tokens ou códigos</li><li>Coexistência verificada automaticamente</li></ul><Link href="/app/whatsapp/settings?method=official">Conectar com a Meta</Link></article>
      <article><div className="method-icon qr">⌗</div><h2>WhatsApp por QR Code</h2><p>Conexão rápida com seu WhatsApp atual, sujeita a desconexões e limitações.</p><ul><li>Sem configuração na Meta</li><li>Pode exigir nova leitura do QR</li><li>Atribuição de anúncios limitada</li></ul><Link className="secondary" href="/app/whatsapp/settings?method=qr">Conectar por QR Code</Link></article>
    </div> : method === "official" ? <div className="connection-step"><span className="step-count">ETAPA 1 DE 3</span><h2>Conecte sua conta da Meta</h2><p>Uma janela segura da Meta será aberta. Entre na sua conta, escolha a empresa e selecione ou cadastre o número. Você não precisará enviar nenhuma chave ao Kavro.</p>
      <div className="step-preview"><span>1</span><div><strong>Entrar com a Meta</strong><small>Use uma conta administradora da empresa.</small></div></div><div className="step-preview"><span>2</span><div><strong>Escolher o WhatsApp</strong><small>Selecione a conta e o número desejado.</small></div></div><div className="step-preview"><span>3</span><div><strong>Confirmar conexão</strong><small>O Kavro verifica permissões, webhook e coexistência.</small></div></div>
      <MetaEmbeddedSignup /><Link href="/app/whatsapp/settings">← Escolher outra forma</Link>
    </div> : <div className="connection-step"><span className="step-count">CONEXÃO ALTERNATIVA</span><h2>Conecte pelo QR Code</h2><p>O Kavro criará um QR Code para leitura no WhatsApp. Mantenha seu celular por perto.</p><div className="method-warning"><strong>Importante</strong><span>Esta modalidade pode ser interrompida pelo WhatsApp e não oferece todos os recursos oficiais de campanhas.</span></div><button disabled>Gerar QR Code</button><small className="availability-note">Será liberado após os testes isolados da Evolution.</small><Link href="/app/whatsapp/settings">← Escolher outra forma</Link></div>}
    <div className="security-note">Configurações feitas aqui afetam somente este ambiente e esta empresa.</div>
  </section></main>;
}

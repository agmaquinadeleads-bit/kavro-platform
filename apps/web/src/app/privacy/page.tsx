import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Política de Privacidade | Kavro",
  description: "Política de Privacidade do Kavro CRM",
};

const updatedAt = "10 de agosto de 2026";

export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <header style={styles.header}>
          <div style={styles.brand}>
            <span style={styles.logo}>K</span>
            <span>Kavro</span>
          </div>
          <p style={styles.eyebrow}>PRIVACIDADE E PROTEÇÃO DE DADOS</p>
          <h1 style={styles.title}>Política de Privacidade</h1>
          <p style={styles.intro}>
            Esta política explica como o Kavro coleta, utiliza, armazena e
            protege dados pessoais ao fornecer sua plataforma de CRM e seus
            canais de atendimento.
          </p>
          <p style={styles.updated}>Última atualização: {updatedAt}</p>
        </header>

        <section style={styles.section}>
          <h2 style={styles.heading}>1. Quem somos</h2>
          <p>
            O Kavro é uma plataforma de CRM operada por <strong>DR MIDIA DIGITAL LTDA</strong>.
            Para assuntos relacionados a esta política ou ao tratamento de dados,
            entre em contato pelo e-mail{" "}
            <a style={styles.link} href="mailto:contato.darlanricardo@gmail.com">
              contato.darlanricardo@gmail.com
            </a>.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>2. Dados que podemos tratar</h2>
          <p>Conforme os recursos utilizados, podemos tratar:</p>
          <ul style={styles.list}>
            <li>dados cadastrais, como nome, e-mail, telefone e empresa;</li>
            <li>dados de autenticação, perfil, permissões e organização;</li>
            <li>informações de leads, negócios, tarefas e histórico comercial;</li>
            <li>mensagens e metadados de conversas integradas ao WhatsApp;</li>
            <li>dados de campanhas e atribuição, como UTMs e identificadores de anúncios;</li>
            <li>registros técnicos, endereço IP, dispositivo, navegador e eventos de segurança;</li>
            <li>informações fornecidas em solicitações de suporte.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>3. Como utilizamos os dados</h2>
          <p>Utilizamos os dados para:</p>
          <ul style={styles.list}>
            <li>criar e administrar contas, equipes, funis e oportunidades;</li>
            <li>disponibilizar conversas e integrações solicitadas pelo cliente;</li>
            <li>processar, entregar e registrar mensagens;</li>
            <li>medir resultados comerciais e atribuição de campanhas;</li>
            <li>prevenir fraude, abuso e acessos não autorizados;</li>
            <li>prestar suporte e melhorar a segurança e o desempenho da plataforma;</li>
            <li>cumprir obrigações legais, regulatórias e contratuais.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>4. Bases legais e responsabilidade do cliente</h2>
          <p>
            O tratamento poderá ocorrer para execução de contrato, cumprimento de
            obrigação legal, exercício regular de direitos, legítimo interesse ou
            consentimento, conforme o caso e a legislação aplicável. Empresas que
            utilizam o Kavro para tratar dados de seus próprios contatos são
            responsáveis por possuir base legal adequada e respeitar as escolhas
            desses titulares.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>5. Compartilhamento e fornecedores</h2>
          <p>
            Podemos utilizar fornecedores de infraestrutura, banco de dados,
            autenticação, monitoramento e comunicação estritamente para operar o
            serviço. Quando o cliente habilita uma integração, dados necessários
            podem ser compartilhados com o respectivo provedor, incluindo a Meta e
            a Plataforma do WhatsApp Business. Não vendemos dados pessoais.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>6. Armazenamento, segurança e transferências</h2>
          <p>
            Adotamos controles técnicos e organizacionais compatíveis com os riscos,
            como controle de acesso, segregação por organização, registros de
            auditoria e conexões criptografadas. Alguns fornecedores podem processar
            dados em outros países, com salvaguardas contratuais e medidas previstas
            na legislação aplicável.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>7. Retenção e exclusão</h2>
          <p>
            Conservamos dados pelo período necessário para prestar os serviços,
            cumprir obrigações legais e proteger direitos. Após o encerramento da
            relação, os dados podem ser excluídos ou anonimizados, salvo quando a
            manutenção for permitida ou exigida por lei.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>8. Direitos dos titulares</h2>
          <p>
            Nos termos da LGPD, o titular pode solicitar confirmação de tratamento,
            acesso, correção, portabilidade quando aplicável, anonimização, bloqueio,
            eliminação, informações sobre compartilhamento e revisão ou revogação de
            consentimento. A solicitação pode ser enviada ao e-mail de contato acima.
            Poderemos solicitar informações para confirmar a identidade do requerente.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>9. Cookies e registros técnicos</h2>
          <p>
            O Kavro pode usar cookies essenciais e armazenamento local para manter a
            sessão, preferências e segurança da conta. Registros técnicos também
            podem ser utilizados para diagnóstico, prevenção de incidentes e melhoria
            do serviço.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>10. Alterações nesta política</h2>
          <p>
            Esta política poderá ser atualizada para refletir mudanças legais,
            operacionais ou nos recursos da plataforma. A versão vigente e sua data
            de atualização permanecerão disponíveis nesta página.
          </p>
        </section>
      </article>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f7f5",
    color: "#14231b",
    padding: "48px 20px",
    fontFamily: "Arial, Helvetica, sans-serif",
    lineHeight: 1.7,
  },
  card: {
    maxWidth: 900,
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid #dce7e0",
    borderRadius: 24,
    padding: "clamp(28px, 6vw, 68px)",
    boxShadow: "0 18px 60px rgba(16, 37, 27, 0.08)",
  },
  header: { borderBottom: "1px solid #e3ebe6", paddingBottom: 32, marginBottom: 36 },
  brand: { display: "flex", alignItems: "center", gap: 12, fontSize: 25, fontWeight: 800 },
  logo: {
    width: 44,
    height: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    background: "#25aa69",
    color: "#fff",
    fontFamily: "Georgia, serif",
    fontSize: 29,
    fontWeight: 700,
  },
  eyebrow: { margin: "34px 0 8px", color: "#158a55", fontSize: 13, fontWeight: 800, letterSpacing: 2 },
  title: { margin: 0, fontSize: "clamp(38px, 7vw, 64px)", lineHeight: 1.05, letterSpacing: -2 },
  intro: { maxWidth: 720, color: "#53645b", fontSize: 18, marginTop: 22 },
  updated: { color: "#718078", fontSize: 14, marginBottom: 0 },
  section: { marginTop: 34 },
  heading: { fontSize: 22, lineHeight: 1.3, marginBottom: 10 },
  list: { paddingLeft: 24 },
  link: { color: "#087847", fontWeight: 700 },
};

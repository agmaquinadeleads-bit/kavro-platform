import { redirect } from "next/navigation";

// Equipe foi incorporada à aba Configurações — essa rota continua existindo
// só porque é um destino de redirect pós-login válido (auth/callback,
// login/actions.ts, pra quem aceitou um convite), não pra navegação normal.
export default function TeamPage() {
  redirect("/app/configuracoes");
}

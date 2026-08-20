"use client";

import type { ReactNode } from "react";

type ChatComposerFormProps = {
  action: (formData: FormData) => void;
  connectionId: string | undefined;
  conversationId: string;
  children: ReactNode;
};

// Limpa o campo na hora do submit, sem esperar a Server Action responder —
// é essa espera (não o envio em si) que fazia o composer parecer lento.
// requestAnimationFrame adia o reset pro próximo frame, depois que o
// FormData já foi capturado pelo React pra chamar a action — resetar de
// forma síncrona correria o risco de limpar o form antes do texto ser lido.
export function ChatComposerForm({ action, connectionId, conversationId, children }: ChatComposerFormProps) {
  return (
    <form
      action={action}
      className="chat-composer no-print"
      onSubmit={(event) => {
        const form = event.currentTarget;
        requestAnimationFrame(() => form.reset());
      }}
    >
      <input type="hidden" name="connection_id" value={connectionId} />
      <input type="hidden" name="conversation_id" value={conversationId} />
      {children}
    </form>
  );
}

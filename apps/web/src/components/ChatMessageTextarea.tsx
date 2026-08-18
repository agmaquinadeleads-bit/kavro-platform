"use client";

import type { KeyboardEvent } from "react";

// Textarea de mensagem não envia com Enter por padrão (é multi-linha) —
// aqui replica o comportamento do WhatsApp Web: Enter envia, Shift+Enter
// quebra linha. Precisa ser client component só por causa do onKeyDown.
export function ChatMessageTextarea() {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!event.currentTarget.value.trim()) return;
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <textarea
      name="text"
      aria-label="Mensagem"
      placeholder="Digite uma mensagem (Enter envia, Shift+Enter quebra linha)"
      required
      maxLength={20000}
      onKeyDown={handleKeyDown}
    />
  );
}

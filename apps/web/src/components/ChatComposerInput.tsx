"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

// Sem lib externa (não tem como rodar pnpm install nesse ambiente pra
// atualizar o lockfile) — um punhado de emojis comuns cobre o pedido de
// deixar a conversa com o lead menos formal.
const EMOJIS = ["😀", "😄", "😊", "🙂", "😉", "😂", "🥰", "😍", "🤔", "😅", "😢", "😡", "👍", "👏", "🙏", "🙌", "💪", "❤️", "🔥", "🎉", "✅", "⏰", "📅", "💬", "📞", "🚀", "✨", "😴"];

// Textarea de mensagem não envia com Enter por padrão (é multi-linha) —
// aqui replica o comportamento do WhatsApp Web: Enter envia, Shift+Enter
// quebra linha. O picker de emoji insere no cursor sem depender de um
// input controlado (a textarea permanece não-controlada).
export function ChatComposerInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, start) + emoji + textarea.value.slice(end);
    const cursor = start + emoji.length;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!event.currentTarget.value.trim()) return;
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <div className="chat-composer-input">
      <div className="emoji-picker-wrap" ref={wrapRef}>
        <button type="button" className="emoji-toggle" aria-label="Inserir emoji" onClick={() => setPickerOpen((open) => !open)}>
          😊
        </button>
        {pickerOpen ? (
          <div className="emoji-picker">
            {EMOJIS.map((emoji) => (
              <button type="button" key={emoji} onClick={() => insertEmoji(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <textarea
        ref={textareaRef}
        name="text"
        aria-label="Mensagem"
        placeholder="Digite uma mensagem (Enter envia, Shift+Enter quebra linha)"
        required
        maxLength={20000}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

// Sem lib externa (não tem como rodar pnpm install nesse ambiente pra
// atualizar o lockfile) — um punhado de emojis comuns cobre o pedido de
// deixar a conversa com o lead menos formal.
const EMOJIS = ["😀", "😄", "😊", "🙂", "😉", "😂", "🥰", "😍", "🤔", "😅", "😢", "😡", "👍", "👏", "🙏", "🙌", "💪", "❤️", "🔥", "🎉", "✅", "⏰", "📅", "💬", "📞", "🚀", "✨", "😴"];
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const ATTACH_ACCEPT = "image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

// Textarea de mensagem não envia com Enter por padrão (é multi-linha) —
// aqui replica o comportamento do WhatsApp Web: Enter envia, Shift+Enter
// quebra linha. O picker de emoji insere no cursor sem depender de um
// input controlado (a textarea permanece não-controlada). O anexo
// (imagem/áudio/documento — útil pra mandar proposta em PDF) vai no
// mesmo <form>, o texto vira legenda opcional.
export function ChatComposerInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");

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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError("");
    if (!file) {
      setFileName(null);
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setFileError("Arquivo maior que 15MB — escolha um menor.");
      event.target.value = "";
      setFileName(null);
      return;
    }
    setFileName(file.name);
  };

  const clearFile = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFileName(null);
    setFileError("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!event.currentTarget.value.trim() && !fileName) return;
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
      <button type="button" className="attach-toggle" aria-label="Anexar áudio, imagem ou documento" onClick={() => fileInputRef.current?.click()}>
        📎
      </button>
      <input
        ref={fileInputRef}
        type="file"
        name="media"
        accept={ATTACH_ACCEPT}
        className="attach-input"
        onChange={handleFileChange}
      />
      <div className="chat-composer-text">
        <textarea
          ref={textareaRef}
          name="text"
          aria-label="Mensagem"
          placeholder={fileName ? "Legenda (opcional)" : "Digite uma mensagem (Enter envia, Shift+Enter quebra linha)"}
          maxLength={20000}
          onKeyDown={handleKeyDown}
        />
        {fileName ? (
          <div className="attach-chip">
            <span>📎 {fileName}</span>
            <button type="button" onClick={clearFile} aria-label="Remover anexo">×</button>
          </div>
        ) : null}
        {fileError ? <small className="availability-note error">{fileError}</small> : null}
      </div>
    </div>
  );
}

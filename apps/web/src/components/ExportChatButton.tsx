"use client";

// Mesmo padrão do botão "Imprimir relatório" (ReportFilterBar.tsx):
// window.print() + CSS de @media print reformatando a página, em vez de
// gerar um PDF no servidor — evita adicionar uma lib de PDF só pra isso, e
// "Salvar como PDF" já é uma opção nativa do diálogo de impressão de
// qualquer navegador.
export function ExportChatButton() {
  return (
    <button type="button" className="export-chat-btn no-print" onClick={() => window.print()}>
      Exportar PDF
    </button>
  );
}

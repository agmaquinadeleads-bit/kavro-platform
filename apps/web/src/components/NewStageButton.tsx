"use client";

import { useState } from "react";
import { NewStageModal } from "./NewStageModal";

interface NewStageButtonProps {
  pipelineId: string | null;
}

export function NewStageButton({ pipelineId }: NewStageButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sem funil selecionado, não há onde criar a etapa — desabilita em vez de
  // quebrar a página (mesmo padrão usado em NewLeadButton).
  if (!pipelineId) {
    return (
      <button type="button" className="btn-secondary" disabled title="Crie um funil primeiro.">
        + Nova etapa
      </button>
    );
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(true)}>
        + Nova etapa
      </button>

      <NewStageModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} pipelineId={pipelineId} />
    </>
  );
}

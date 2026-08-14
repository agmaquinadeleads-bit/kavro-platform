"use client";

import { useState } from "react";
import { NewLeadModal } from "./NewLeadModal";

interface NewLeadButtonProps {
  pipelineId: string | null;
  firstStageId: string | null;
}

export function NewLeadButton({ pipelineId, firstStageId }: NewLeadButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sem pipeline/etapa aberta configurada, não há como montar um lead válido —
  // desabilita o botão em vez de quebrar a página.
  if (!pipelineId || !firstStageId) {
    return (
      <button
        type="button"
        className="btn-primary"
        disabled
        title="Configure um pipeline com uma etapa aberta para criar leads."
      >
        + Novo lead
      </button>
    );
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setIsModalOpen(true)}>
        + Novo lead
      </button>

      <NewLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        pipelineId={pipelineId}
        firstStageId={firstStageId}
      />
    </>
  );
}

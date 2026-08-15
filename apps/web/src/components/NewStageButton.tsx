"use client";

import { useState } from "react";
import { NewStageModal } from "./NewStageModal";

export function NewStageButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(true)}>
        + Nova etapa
      </button>

      <NewStageModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}

"use client";

import { useState } from "react";
import { NewBrandModal } from "./NewBrandModal";

export function NewBrandButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setIsModalOpen(true)}>
        + Nova marca
      </button>

      <NewBrandModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}

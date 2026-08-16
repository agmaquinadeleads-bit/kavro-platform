"use client";

import { useState } from "react";
import { BrandIdentityModal } from "./BrandIdentityModal";

interface BrandIdentityButtonProps {
  brandId: string;
  brandName: string;
  initialValue: string;
}

export function BrandIdentityButton({ brandId, brandName, initialValue }: BrandIdentityButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(true)}>
        Identidade visual
      </button>

      <BrandIdentityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        brandId={brandId}
        brandName={brandName}
        initialValue={initialValue}
      />
    </>
  );
}

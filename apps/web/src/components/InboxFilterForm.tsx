"use client";

import type { FormEvent } from "react";

// Cada <select>/<input type="search"> dentro filtra na hora — sem isso
// o usuário precisaria de um botão "Aplicar" separado. requestSubmit()
// dispara a navegação GET normal do Next (troca a query string, a
// página inteira já é Server Component reagindo a ela).
export function InboxFilterForm({ children }: { children: React.ReactNode }) {
  const handleChange = (event: FormEvent<HTMLFormElement>) => {
    event.currentTarget.requestSubmit();
  };

  return (
    <form method="get" className="inbox-filters" onChange={handleChange}>
      {children}
    </form>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LeadsTable } from "./LeadsTable";
import { PaginationControls } from "./PaginationControls";
import { type LeadRowData } from "./LeadRow";

interface LeadsPageClientProps {
  leads: LeadRowData[];
  totalItems: number;
  currentPage: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export function LeadsPageClient({
  leads,
  totalItems,
  currentPage,
  pageSize,
  sortBy,
  sortOrder
}: LeadsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleHeaderClick = (columnKey: string) => {
    // If clicking the same column, toggle sort order
    let newSortOrder: "asc" | "desc" = "asc";
    if (sortBy === columnKey && sortOrder === "asc") {
      newSortOrder = "desc";
    }

    // Build new URL with updated sort params (reset to page 1)
    const params = new URLSearchParams(searchParams);
    params.set("sortBy", columnKey);
    params.set("sortOrder", newSortOrder);
    params.set("page", "1");
    params.set("pageSize", pageSize.toString());

    router.push(`?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    params.set("pageSize", pageSize.toString());
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);

    router.push(`?${params.toString()}`);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("pageSize", newPageSize.toString());
    params.set("page", "1"); // Reset to first page
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);

    router.push(`?${params.toString()}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      <div style={{ flex: 1, overflow: "auto" }}>
        <LeadsTable
          leads={leads}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onHeaderClick={handleHeaderClick}
        />
      </div>
      <div style={{
        borderTop: "1px solid var(--line)",
        padding: "12px 16px",
        backgroundColor: "var(--surface)"
      }}>
        <PaginationControls
          totalItems={totalItems}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  );
}

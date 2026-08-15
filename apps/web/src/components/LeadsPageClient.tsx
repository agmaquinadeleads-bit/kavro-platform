"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LeadsTable } from "./LeadsTable";
import { PaginationControls } from "./PaginationControls";
import { FilterBar } from "./FilterBar";
import { FilterBadges } from "./FilterBadges";
import { BulkActions } from "./BulkActions";
import { ConfirmModal } from "./ConfirmModal";
import { LossReasonModal } from "./LossReasonModal";
import { type LeadRowData } from "./LeadRow";
import { deleteBulkLeads, moveBulkLeadsToLoss } from "@/app/app/actions";

interface Stage {
  id: string;
  name: string;
}

interface Creative {
  id: string;
  name: string;
}

interface FilterData {
  searchText: string;
  dateFrom: string | null;
  dateTo: string | null;
  selectedStage: string | null;
  selectedOrigin: string | null;
  selectedCreative: string | null;
  stages: Stage[];
  origins: string[];
  creatives: Creative[];
  stageNamesMap: Record<string, string>;
  creativeNamesMap: Record<string, string>;
}

interface LeadsPageClientProps {
  leads: LeadRowData[];
  totalItems: number;
  currentPage: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  filterData?: FilterData;
}

export function LeadsPageClient({
  leads,
  totalItems,
  currentPage,
  pageSize,
  sortBy,
  sortOrder,
  filterData
}: LeadsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isLossModalOpen, setIsLossModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleSelectChange = (leadId: string, isSelected: boolean) => {
    const newSelection = new Set(selectedLeadIds);
    if (isSelected) {
      newSelection.add(leadId);
    } else {
      newSelection.delete(leadId);
    }
    setSelectedLeadIds(newSelection);
  };

  const handleSelectAll = (selectAll: boolean) => {
    if (selectAll) {
      const newSelection = new Set(leads.map((lead) => lead.id));
      setSelectedLeadIds(newSelection);
    } else {
      setSelectedLeadIds(new Set());
    }
  };

  const handleBulkDeleteClick = () => {
    setIsDeleteConfirmOpen(true);
  };

  const handleBulkDeleteCancel = () => {
    setIsDeleteConfirmOpen(false);
  };

  const handleBulkDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const leadIds = Array.from(selectedLeadIds);
      const result = await deleteBulkLeads(leadIds);

      if (result.success) {
        setSelectedLeadIds(new Set());
        setIsDeleteConfirmOpen(false);
        router.refresh();
      }
    } catch (error) {
      console.error("Erro ao arquivar leads:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveBulkLeadsToLoss = async (reason: string) => {
    setIsDeleting(true);
    try {
      const leadIds = Array.from(selectedLeadIds);
      const result = await moveBulkLeadsToLoss(leadIds, reason);

      if (result.success) {
        setSelectedLeadIds(new Set());
        setIsLossModalOpen(false);
        router.refresh();
        // Optional: Show success toast
        // toast.success(`${result.count} leads movidos para Perdidos`);
      }
    } catch (error) {
      console.error("Erro ao mover leads para Perdidos:", error);
      // Optional: Show error toast
      // toast.error("Erro ao mover leads para Perdidos");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelSelection = () => {
    setSelectedLeadIds(new Set());
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {filterData && (
          <>
            <FilterBar
              searchText={filterData.searchText}
              dateFrom={filterData.dateFrom}
              dateTo={filterData.dateTo}
              selectedStage={filterData.selectedStage}
              selectedOrigin={filterData.selectedOrigin}
              selectedCreative={filterData.selectedCreative}
              stages={filterData.stages}
              origins={filterData.origins}
              creatives={filterData.creatives}
            />
            <FilterBadges
              filters={{
                search: filterData.searchText,
                dateFrom: filterData.dateFrom,
                dateTo: filterData.dateTo,
                stage: filterData.selectedStage,
                origin: filterData.selectedOrigin,
                creative: filterData.selectedCreative,
                stageNames: filterData.stageNamesMap,
                creativeNames: filterData.creativeNamesMap
              }}
            />
          </>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            <LeadsTable
              leads={leads}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onHeaderClick={handleHeaderClick}
              selectedLeadIds={selectedLeadIds}
              onSelectChange={handleSelectChange}
              onSelectAllChange={handleSelectAll}
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
      </div>

      <BulkActions
        selectedCount={selectedLeadIds.size}
        onDelete={handleBulkDeleteClick}
        onCancel={handleCancelSelection}
        isDeleting={isDeleting}
      />

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        title="Arquivar leads"
        message={`Tem certeza que deseja arquivar ${selectedLeadIds.size} lead${selectedLeadIds.size === 1 ? "" : "s"} selecionado${selectedLeadIds.size === 1 ? "" : "s"}? Eles somem da lista, mas os dados continuam salvos.`}
        confirmText="Arquivar"
        cancelText="Cancelar"
        isDangerous
        isLoading={isDeleting}
        onCancel={handleBulkDeleteCancel}
        onConfirm={handleBulkDeleteConfirm}
      />

      {/* Fluxo de "mover selecionados para Perdido" já implementado, sem
          botão próprio pra acioná-lo no momento — mantido pronto pra uso
          futuro, não removido junto da correção do botão Deletar. */}
      <LossReasonModal
        isOpen={isLossModalOpen}
        selectedLeadIds={selectedLeadIds}
        onConfirm={handleMoveBulkLeadsToLoss}
        onCancel={() => setIsLossModalOpen(false)}
        isLoading={isDeleting}
      />
    </>
  );
}

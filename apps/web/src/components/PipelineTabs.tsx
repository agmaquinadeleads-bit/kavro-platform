"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useState } from "react";
import { deletePipeline, renamePipeline } from "@/app/app/actions";
import { ConfirmModal } from "./ConfirmModal";
import { NewPipelineModal } from "./NewPipelineModal";

export interface PipelineTabItem {
  id: string;
  name: string;
  leadCount: number;
  isProtected: boolean;
}

interface PipelineTabsProps {
  pipelines: PipelineTabItem[];
  activePipelineId: string | null;
}

export function PipelineTabs({ pipelines, activePipelineId }: PipelineTabsProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pipelineToRename, setPipelineToRename] = useState<PipelineTabItem | null>(null);
  const [pipelineToDelete, setPipelineToDelete] = useState<PipelineTabItem | null>(null);
  const [isDeletingPipeline, setIsDeletingPipeline] = useState(false);
  const [openMenuPipelineId, setOpenMenuPipelineId] = useState<string | null>(null);

  // Fecha o menu do funil aberto ao clicar em qualquer lugar fora dele —
  // mesmo padrão do menu de coluna no KanbanBoard.
  useEffect(() => {
    if (!openMenuPipelineId) return;
    function handleClickOutside() {
      setOpenMenuPipelineId(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [openMenuPipelineId]);

  async function submitDeletePipeline(pipelineId: string) {
    setIsDeletingPipeline(true);
    try {
      const fd = new FormData();
      fd.set("pipeline_id", pipelineId);
      // deletePipeline é uma server action que faz redirect() internamente —
      // mesmo padrão de submitDeleteStage no KanbanBoard.
      await deletePipeline(fd);
    } finally {
      setIsDeletingPipeline(false);
    }
  }

  return (
    <>
      <nav className="pipeline-tabs" aria-label="Funis">
        {pipelines.map((pipeline) => {
          const isActive = pipeline.id === activePipelineId;
          return (
            <div key={pipeline.id} className={`pipeline-tab${isActive ? " pipeline-tab-active" : ""}`}>
              <Link href={`/app/pipeline?pipeline=${pipeline.id}`} className="pipeline-tab-link" aria-current={isActive ? "page" : undefined}>
                {pipeline.name}
                <span className="pipeline-tab-count">{pipeline.leadCount}</span>
              </Link>
              {isActive ? (
                <div className="col-menu">
                  <button
                    type="button"
                    className="col-menu-btn"
                    aria-label={`Opções do funil ${pipeline.name}`}
                    aria-haspopup="true"
                    aria-expanded={openMenuPipelineId === pipeline.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuPipelineId((current) => (current === pipeline.id ? null : pipeline.id));
                    }}
                  >
                    ⋮
                  </button>
                  {openMenuPipelineId === pipeline.id ? (
                    <div className="col-menu-dropdown" role="menu" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="col-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuPipelineId(null);
                          setPipelineToRename(pipeline);
                        }}
                      >
                        Renomear funil
                      </button>
                      {!pipeline.isProtected ? (
                        <>
                          <hr className="col-menu-divider" />
                          <button
                            type="button"
                            className="col-menu-item col-menu-item-danger"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuPipelineId(null);
                              setPipelineToDelete(pipeline);
                            }}
                          >
                            Excluir funil
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        <button type="button" className="pipeline-tab-add" onClick={() => setIsCreateOpen(true)}>
          + Novo funil
        </button>
      </nav>

      <NewPipelineModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      {pipelineToRename ? (
        <RenamePipelinePrompt pipeline={pipelineToRename} onCancel={() => setPipelineToRename(null)} />
      ) : null}

      <ConfirmModal
        isOpen={pipelineToDelete !== null}
        title="Excluir funil"
        message={`Tem certeza que deseja excluir o funil "${pipelineToDelete?.name ?? ""}"? Só é possível excluir funis sem nenhum lead. Essa ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        isDangerous
        isLoading={isDeletingPipeline}
        onCancel={() => setPipelineToDelete(null)}
        onConfirm={() => {
          if (!pipelineToDelete) return;
          const pipelineId = pipelineToDelete.id;
          setPipelineToDelete(null);
          void submitDeletePipeline(pipelineId);
        }}
      />
    </>
  );
}

type RenamePipelinePromptProps = {
  pipeline: PipelineTabItem;
  onCancel: () => void;
};

function RenamePipelinePrompt({ pipeline, onCancel }: RenamePipelinePromptProps) {
  const overlayStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000
  };

  const modalStyle: CSSProperties = {
    backgroundColor: "var(--surface)",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    padding: "24px",
    maxWidth: "360px",
    width: "90%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
  };

  const titleStyle: CSSProperties = {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 12px 0"
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    height: "38px",
    border: "1px solid var(--line)",
    borderRadius: "7px",
    padding: "0 10px",
    fontSize: "13px",
    color: "var(--ink)",
    marginBottom: "16px"
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end"
  };

  const cancelButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    cursor: "pointer"
  };

  const confirmButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: "var(--primary)",
    color: "white",
    border: "1px solid transparent",
    borderRadius: "6px",
    cursor: "pointer"
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <h2 style={titleStyle}>Renomear funil</h2>
        <form action={renamePipeline}>
          <input type="hidden" name="pipeline_id" value={pipeline.id} />
          <input
            type="text"
            name="name"
            required
            maxLength={100}
            autoFocus
            defaultValue={pipeline.name}
            aria-label="Novo nome do funil"
            style={inputStyle}
          />
          <div style={buttonsStyle}>
            <button type="button" style={cancelButtonStyle} onClick={onCancel}>Cancelar</button>
            <button type="submit" style={confirmButtonStyle}>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

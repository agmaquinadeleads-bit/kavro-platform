"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { moveLead } from "@/app/app/actions";
import type { DashboardStage } from "./dashboard";

function MoveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Movendo..." : "Mover"}</button>;
}

type MoveLeadFormProps = {
  leadId: string;
  leadName: string;
  version: number;
  currentStageId: string;
  stages: DashboardStage[];
};

export function MoveLeadForm({ leadId, leadName, version, currentStageId, stages }: MoveLeadFormProps) {
  const [stageId, setStageId] = useState(currentStageId);
  const targetStage = stages.find((stage) => stage.id === stageId);

  return (
    <form className="move-form" action={moveLead}>
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="version" value={version} />
      <label htmlFor={`stage-${leadId}`}>Mover para</label>
      <select id={`stage-${leadId}`} name="stage_id" value={stageId} onChange={(event) => setStageId(event.target.value)}>
        {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
      </select>
      {targetStage?.isLost ? <input key="loss-reason" className="loss-reason-input" name="loss_reason" required maxLength={160} placeholder="Por que essa oportunidade foi perdida?" aria-label={`Motivo de perda de ${leadName}`} /> : <input key="empty-loss-reason" type="hidden" name="loss_reason" value="" />}
      <MoveButton />
    </form>
  );
}

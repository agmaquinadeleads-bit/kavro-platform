import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvironment(path) {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

const environment = { ...readEnvironment(".env.local"), ...readEnvironment(".env.test.local") };
const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "KAVRO_TEST_OWNER_EMAIL", "KAVRO_TEST_OWNER_PASSWORD", "KAVRO_TEST_OUTSIDER_EMAIL", "KAVRO_TEST_OUTSIDER_PASSWORD"];
for (const name of required) if (!environment[name]) throw new Error(`Missing test environment variable: ${name}`);

function client() {
  return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const owner = client();
const outsider = client();
const results = [];

function assert(condition, message) { if (!condition) throw new Error(message); }
async function test(name, check) { await check(); results.push({ name, status: "passed" }); }
async function signIn(supabase, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Test user authentication failed");
  return data.user.id;
}
async function context(supabase) {
  const { data: membership, error: membershipError } = await supabase.from("organization_members").select("org_id").limit(1).single();
  if (membershipError) throw new Error("Membership fixture missing");
  const { data: pipeline, error: pipelineError } = await supabase.from("pipelines").select("id, org_id").eq("org_id", membership.org_id).order("position").limit(1).single();
  if (pipelineError) throw new Error("Pipeline fixture missing");
  const { data: stages, error: stagesError } = await supabase.from("pipeline_stages").select("id, name, position").eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).order("position");
  if (stagesError || !stages?.length) throw new Error("Stage fixture missing");
  return { orgId: membership.org_id, pipelineId: pipeline.id, stages };
}

const ownerId = await signIn(owner, environment.KAVRO_TEST_OWNER_EMAIL, environment.KAVRO_TEST_OWNER_PASSWORD);
const outsiderId = await signIn(outsider, environment.KAVRO_TEST_OUTSIDER_EMAIL, environment.KAVRO_TEST_OUTSIDER_PASSWORD);
const ownerContext = await context(owner);
const outsiderContext = await context(outsider);

let targetStage = ownerContext.stages[1];
if (!targetStage) {
  const { data, error } = await owner.from("pipeline_stages").insert({ org_id: ownerContext.orgId, pipeline_id: ownerContext.pipelineId, name: "Qualificação teste", position: 1 }).select("id, name, position").single();
  if (error) throw new Error("Could not create movement stage fixture");
  targetStage = data;
}

const runId = Date.now().toString(36);
let createdLead;

await test("authorized lead creation normalizes protected fields", async () => {
  const { data, error } = await owner.from("leads").insert({
    org_id: ownerContext.orgId,
    pipeline_id: ownerContext.pipelineId,
    stage_id: ownerContext.stages[0].id,
    created_by: outsiderId,
    name: `Lead CRUD ${runId}`,
    source: "Teste automatizado",
    value_in_cents: 125000,
    version: 999
  }).select("id, org_id, pipeline_id, stage_id, created_by, status, version, deleted_at").single();
  assert(!error && data, "Authorized insert failed");
  assert(data.created_by === ownerId, "created_by was not protected");
  assert(data.version === 1, "Initial version was not normalized");
  assert(data.status === "open" && data.deleted_at === null, "Initial state is invalid");
  createdLead = data;
});

await test("outsider cannot read or update owner lead", async () => {
  const read = await outsider.from("leads").select("id").eq("id", createdLead.id);
  const update = await outsider.from("leads").update({ name: "Cross tenant" }).eq("id", createdLead.id).select("id");
  assert(!read.error && read.data?.length === 0, "Cross-tenant read was not blocked");
  assert(!update.error && update.data?.length === 0, "Cross-tenant update was not blocked");
});

await test("cross-tenant stage is rejected", async () => {
  const { error } = await owner.from("leads").update({ stage_id: outsiderContext.stages[0].id }).eq("id", createdLead.id).eq("version", 1).select("id");
  assert(Boolean(error), "Cross-tenant stage was accepted");
});

await test("authorized stage move increments version", async () => {
  const { data, error } = await owner.from("leads").update({ stage_id: targetStage.id }).eq("id", createdLead.id).eq("version", 1).select("id, stage_id, version").single();
  assert(!error && data?.stage_id === targetStage.id, "Stage move failed");
  assert(data.version === 2, "Version did not increment");
  createdLead = { ...createdLead, ...data };
});

await test("stale concurrent update is rejected", async () => {
  const { data, error } = await owner.from("leads").update({ name: "Stale write" }).eq("id", createdLead.id).eq("version", 1).select("id");
  assert(!error && data?.length === 0, "Stale update was accepted");
});

await test("soft archive increments version and hides active lead", async () => {
  const archivedAt = new Date().toISOString();
  const { data, error } = await owner.from("leads").update({ deleted_at: archivedAt }).eq("id", createdLead.id).eq("version", 2).select("id, version, deleted_at").single();
  assert(!error && data?.deleted_at && data.version === 3, "Soft archive failed");
  const active = await owner.from("leads").select("id").eq("id", createdLead.id).is("deleted_at", null);
  assert(!active.error && active.data?.length === 0, "Archived lead remained active");
});

await test("hard delete is denied", async () => {
  const { error } = await owner.from("leads").delete().eq("id", createdLead.id);
  assert(Boolean(error), "Hard delete was unexpectedly allowed");
});

await test("audit trail records lead lifecycle", async () => {
  const { data, error } = await owner.from("audit_events").select("action").eq("resource_id", createdLead.id).order("created_at");
  const actions = new Set((data ?? []).map((event) => event.action));
  assert(!error, "Audit trail query failed");
  assert(actions.has("lead.created") && actions.has("lead.stage_changed") && actions.has("lead.archived"), "Audit lifecycle is incomplete");
});

console.log(JSON.stringify({ status: "passed", tests: results, sensitiveValuesPrinted: false }, null, 2));
await owner.auth.signOut();
await outsider.auth.signOut();


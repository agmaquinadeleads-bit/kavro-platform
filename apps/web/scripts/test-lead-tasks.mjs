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

function client() { return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
async function signIn(supabase, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Test user authentication failed");
  return data.user.id;
}

const owner = client();
const outsider = client();
const ownerId = await signIn(owner, environment.KAVRO_TEST_OWNER_EMAIL, environment.KAVRO_TEST_OWNER_PASSWORD);
await signIn(outsider, environment.KAVRO_TEST_OUTSIDER_EMAIL, environment.KAVRO_TEST_OUTSIDER_PASSWORD);
const { data: membership } = await owner.from("organization_members").select("org_id").limit(1).single();
const { data: pipeline } = await owner.from("pipelines").select("id").eq("org_id", membership.org_id).order("position").limit(1).single();
const { data: stage } = await owner.from("pipeline_stages").select("id").eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).order("position").limit(1).single();
const runId = Date.now().toString(36);
const { data: lead, error: leadError } = await owner.from("leads").insert({ org_id: membership.org_id, pipeline_id: pipeline.id, stage_id: stage.id, created_by: ownerId, name: `Lead Tasks ${runId}` }).select("id, version").single();
assert(!leadError && lead, "Could not create task test lead");

const results = [];
async function test(name, check) { await check(); results.push({ name, status: "passed" }); }
let task;

await test("owner creates a protected task", async () => {
  const response = await owner.from("lead_tasks").insert({ org_id: membership.org_id, lead_id: lead.id, title: `Tarefa ${runId}`, created_by: crypto.randomUUID(), assigned_to: ownerId, version: 999 }).select("id, created_by, version, completed_at").single();
  assert(!response.error && response.data, "Task creation failed");
  assert(response.data.created_by === ownerId && response.data.version === 1 && response.data.completed_at === null, "Protected fields were not normalized");
  task = response.data;
});

await test("outsider cannot read or update task", async () => {
  const read = await outsider.from("lead_tasks").select("id").eq("id", task.id);
  const update = await outsider.from("lead_tasks").update({ title: "Cross tenant" }).eq("id", task.id).select("id");
  assert(!read.error && read.data?.length === 0, "Cross-tenant read was not blocked");
  assert(!update.error && update.data?.length === 0, "Cross-tenant update was not blocked");
});

await test("completion increments version and stale write is rejected", async () => {
  const completed = await owner.from("lead_tasks").update({ completed_at: new Date().toISOString() }).eq("id", task.id).eq("version", 1).select("version, completed_at").single();
  assert(!completed.error && completed.data?.version === 2 && completed.data.completed_at, "Task completion failed");
  const stale = await owner.from("lead_tasks").update({ title: "Stale" }).eq("id", task.id).eq("version", 1).select("id");
  assert(!stale.error && stale.data?.length === 0, "Stale update was accepted");
});

await test("hard delete is denied", async () => {
  const deleted = await owner.from("lead_tasks").delete().eq("id", task.id);
  assert(Boolean(deleted.error), "Hard delete was unexpectedly allowed");
});

await test("task lifecycle is audited on the lead", async () => {
  const response = await owner.from("audit_events").select("action").eq("resource_id", lead.id);
  const actions = new Set((response.data ?? []).map((event) => event.action));
  assert(!response.error && actions.has("lead_task.created") && actions.has("lead_task.completed"), "Task audit lifecycle is incomplete");
});

await owner.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", lead.id);
console.log(JSON.stringify({ status: "passed", tests: results, sensitiveValuesPrinted: false }, null, 2));
await owner.auth.signOut();
await outsider.auth.signOut();

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvironment(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

const publicEnvironment = readEnvironment(".env.local");
const testEnvironment = readEnvironment(".env.test.local");

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "KAVRO_TEST_OWNER_EMAIL",
  "KAVRO_TEST_OWNER_PASSWORD",
  "KAVRO_TEST_OUTSIDER_EMAIL",
  "KAVRO_TEST_OUTSIDER_PASSWORD"
];

const environment = { ...publicEnvironment, ...testEnvironment };

for (const name of required) {
  if (!environment[name]) {
    throw new Error(`Missing test environment variable: ${name}`);
  }
}

function client() {
  return createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const owner = client();
const outsider = client();

async function signIn(supabase, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Test user authentication failed");
  return data.user.id;
}

async function createOrganization(supabase, suffix, label) {
  const { data, error } = await supabase.rpc("create_organization", {
    organization_name: `Kavro ${label} ${suffix}`,
    organization_slug: `kavro-${label.toLowerCase()}-${suffix}`
  });
  if (error || !data?.id) throw new Error("Organization bootstrap failed");
  return data;
}

async function createFixture(supabase, userId, organization, label) {
  const { data: pipeline, error: pipelineError } = await supabase
    .from("pipelines")
    .insert({ org_id: organization.id, name: `Pipeline ${label}`, position: 0 })
    .select("id, org_id")
    .single();
  if (pipelineError || !pipeline) throw new Error("Pipeline fixture failed");

  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages")
    .insert({
      org_id: organization.id,
      pipeline_id: pipeline.id,
      name: "Novos leads",
      position: 0
    })
    .select("id, org_id")
    .single();
  if (stageError || !stage) throw new Error("Stage fixture failed");

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      org_id: organization.id,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      created_by: userId,
      name: `Lead ${label}`
    })
    .select("id, org_id")
    .single();
  if (leadError || !lead) throw new Error("Lead fixture failed");

  return { pipeline, stage, lead };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now().toString(36);
const ownerId = await signIn(
  owner,
  environment.KAVRO_TEST_OWNER_EMAIL,
  environment.KAVRO_TEST_OWNER_PASSWORD
);
const outsiderId = await signIn(
  outsider,
  environment.KAVRO_TEST_OUTSIDER_EMAIL,
  environment.KAVRO_TEST_OUTSIDER_PASSWORD
);

const ownerOrganization = await createOrganization(owner, suffix, "Owner");
const outsiderOrganization = await createOrganization(outsider, suffix, "Outsider");
const ownerFixture = await createFixture(owner, ownerId, ownerOrganization, "Owner");
const outsiderFixture = await createFixture(
  outsider,
  outsiderId,
  outsiderOrganization,
  "Outsider"
);

const results = [];

async function test(name, check) {
  await check();
  results.push({ name, status: "passed" });
}

await test("outsider cannot read owner lead", async () => {
  const { data, error } = await outsider
    .from("leads")
    .select("id")
    .eq("id", ownerFixture.lead.id);
  assert(!error && data?.length === 0, "Cross-tenant read was not blocked");
});

await test("owner cannot read outsider lead", async () => {
  const { data, error } = await owner
    .from("leads")
    .select("id")
    .eq("id", outsiderFixture.lead.id);
  assert(!error && data?.length === 0, "Reverse cross-tenant read was not blocked");
});

await test("outsider cannot update owner lead", async () => {
  const { data, error } = await outsider
    .from("leads")
    .update({ name: "Unauthorized change" })
    .eq("id", ownerFixture.lead.id)
    .select("id");
  assert(!error && data?.length === 0, "Cross-tenant update was not blocked");
});

await test("outsider cannot insert into owner organization", async () => {
  const { error } = await outsider.from("leads").insert({
    org_id: ownerOrganization.id,
    pipeline_id: ownerFixture.pipeline.id,
    stage_id: ownerFixture.stage.id,
    created_by: outsiderId,
    name: "Unauthorized insert"
  });
  assert(Boolean(error), "Cross-tenant insert was not blocked");
});

await test("members can read their own organization data", async () => {
  const { data, error } = await owner
    .from("leads")
    .select("id")
    .eq("id", ownerFixture.lead.id);
  assert(!error && data?.length === 1, "Authorized read failed");
});

console.log(JSON.stringify({
  status: "passed",
  tests: results,
  sensitiveValuesPrinted: false
}, null, 2));

await owner.auth.signOut();
await outsider.auth.signOut();


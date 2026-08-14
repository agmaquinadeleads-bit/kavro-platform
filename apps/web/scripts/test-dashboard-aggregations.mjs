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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(results, name, check) {
  await check();
  results.push({ name, status: "passed" });
}

// Este script valida ponta a ponta a função get_dashboard_leads_total
// (packages/database/migrations/0015_dashboard_aggregations.sql): a
// função-piloto da camada de agregação do dashboard. Requer que a migration
// 0015 já esteja aplicada no ambiente apontado por NEXT_PUBLIC_SUPABASE_URL.
await signIn(owner, environment.KAVRO_TEST_OWNER_EMAIL, environment.KAVRO_TEST_OWNER_PASSWORD);
await signIn(outsider, environment.KAVRO_TEST_OUTSIDER_EMAIL, environment.KAVRO_TEST_OUTSIDER_PASSWORD);

const { data: ownerMembership, error: ownerMembershipError } = await owner
  .from("organization_members")
  .select("org_id")
  .limit(1)
  .single();
if (ownerMembershipError || !ownerMembership) throw new Error("Owner membership fixture missing");

const { data: outsiderMembership, error: outsiderMembershipError } = await outsider
  .from("organization_members")
  .select("org_id")
  .limit(1)
  .single();
if (outsiderMembershipError || !outsiderMembership) throw new Error("Outsider membership fixture missing");

const results = [];

await test(results, "member gets correct total_count for own org_id", async () => {
  const { count, error: countError } = await owner
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ownerMembership.org_id)
    .is("deleted_at", null);
  if (countError) throw new Error("Reference count query failed");

  const { data, error } = await owner.rpc("get_dashboard_leads_total", {
    p_org_id: ownerMembership.org_id
  });
  assert(!error, `RPC call failed: ${error?.message}`);
  assert(Array.isArray(data) && data.length === 1, "RPC did not return a single row");
  assert(Number(data[0].total_count) === count, "total_count did not match reference count");
});

await test(results, "member cannot query another org_id via RPC", async () => {
  const { data, error } = await owner.rpc("get_dashboard_leads_total", {
    p_org_id: outsiderMembership.org_id
  });
  assert(!data && Boolean(error), "Cross-tenant RPC call was not rejected");
});

console.log(JSON.stringify({
  status: "passed",
  tests: results,
  sensitiveValuesPrinted: false
}, null, 2));

await owner.auth.signOut();
await outsider.auth.signOut();

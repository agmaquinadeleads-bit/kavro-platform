import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvironment(path) { return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; })); }
const environment = { ...readEnvironment(".env.local"), ...readEnvironment(".env.test.local") };
function client() { return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
async function signIn(supabase, email, password) { const result = await supabase.auth.signInWithPassword({ email, password }); if (result.error || !result.data.user) throw new Error("Test authentication failed"); return result.data.user.id; }
const owner = client(); const outsider = client(); const results = [];
async function test(name, check) { await check(); results.push({ name, status: "passed" }); }
const ownerId = await signIn(owner, environment.KAVRO_TEST_OWNER_EMAIL, environment.KAVRO_TEST_OWNER_PASSWORD);
await signIn(outsider, environment.KAVRO_TEST_OUTSIDER_EMAIL, environment.KAVRO_TEST_OUTSIDER_PASSWORD);
const { data: membership } = await owner.from("organization_members").select("org_id").single();

await test("members can read their empty WhatsApp domain", async () => {
  for (const table of ["whatsapp_connections", "whatsapp_conversations", "whatsapp_messages"]) {
    const response = await owner.from(table).select("id").limit(1);
    assert(!response.error, `Read policy failed for ${table}`);
  }
});

await test("browser cannot create a WhatsApp connection", async () => {
  const response = await owner.from("whatsapp_connections").insert({ org_id: membership.org_id, provider: "evolution", display_name: "Blocked browser write", instance_name: `blocked_${crypto.randomUUID().replaceAll("-", "")}`, created_by: ownerId });
  assert(Boolean(response.error), "Authenticated browser unexpectedly created a connection");
});

await test("browser cannot forge messages or webhook events", async () => {
  const message = await owner.from("whatsapp_messages").insert({ org_id: membership.org_id, connection_id: crypto.randomUUID(), conversation_id: crypto.randomUUID(), direction: "inbound", message_type: "text", text_content: "forged" });
  const event = await owner.from("whatsapp_webhook_events").insert({ org_id: membership.org_id, connection_id: crypto.randomUUID(), event_name: "MESSAGES_UPSERT", payload_hash: "0".repeat(64) });
  assert(Boolean(message.error) && Boolean(event.error), "Authenticated browser forged WhatsApp data");
});

await test("organizations cannot see each other's WhatsApp rows", async () => {
  const ownerRead = await owner.from("whatsapp_connections").select("id, org_id");
  const outsiderRead = await outsider.from("whatsapp_connections").select("id, org_id");
  assert(!ownerRead.error && !outsiderRead.error, "Tenant-safe reads failed");
  const ownerIds = new Set((ownerRead.data ?? []).map((row) => row.org_id));
  const outsiderIds = new Set((outsiderRead.data ?? []).map((row) => row.org_id));
  assert(![...ownerIds].some((id) => outsiderIds.has(id)), "Cross-tenant WhatsApp rows were exposed");
});

console.log(JSON.stringify({ status: "passed", tests: results, sensitiveValuesPrinted: false }, null, 2));
await owner.auth.signOut(); await outsider.auth.signOut();

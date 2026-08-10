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
const outsiderId = await signIn(outsider, environment.KAVRO_TEST_OUTSIDER_EMAIL, environment.KAVRO_TEST_OUTSIDER_PASSWORD);

let invitation;
await test("owner creates a hashed invitation token", async () => {
  const response = await owner.rpc("create_org_invitation", { invitee_email: environment.KAVRO_TEST_OUTSIDER_EMAIL, invitee_role: "member" });
  assert(!response.error && /^[a-f0-9]{64}$/.test(response.data?.token ?? "") && response.data?.id, `Secure invitation creation failed: ${response.error?.message ?? "invalid response"}`);
  invitation = response.data;
  const stored = await owner.from("organization_invitations").select("id, token_hash").eq("id", invitation.id).single();
  assert(!stored.error && stored.data && !("token" in stored.data), "Plain invitation token is stored or exposed");
});

await test("another organization cannot list the invitation", async () => {
  const response = await outsider.from("organization_invitations").select("id").eq("id", invitation.id);
  assert(!response.error && response.data?.length === 0, "Cross-tenant invitation read was not blocked");
});

await test("wrong organization user cannot accept the invitation", async () => {
  const response = await outsider.rpc("accept_org_invitation", { invitation_token: invitation.token });
  assert(Boolean(response.error), "Invitation was accepted by an ineligible user");
});

await test("owner cancels and token cannot be reused", async () => {
  const cancelled = await owner.rpc("cancel_org_invitation", { invitation_id: invitation.id });
  assert(!cancelled.error, "Invitation cancellation failed");
  const reuse = await outsider.rpc("accept_org_invitation", { invitation_token: invitation.token });
  assert(Boolean(reuse.error), "Cancelled invitation was reused");
});

await test("invitation lifecycle is audited without token metadata", async () => {
  const response = await owner.from("audit_events").select("action, metadata").eq("resource_id", invitation.id);
  const actions = new Set((response.data ?? []).map((event) => event.action));
  assert(!response.error && actions.has("invitation.created") && actions.has("invitation.cancelled"), "Invitation audit lifecycle is incomplete");
  assert(!(response.data ?? []).some((event) => JSON.stringify(event.metadata).includes(invitation.token)), "Invitation token leaked to audit metadata");
});

await test("owner cannot remove self", async () => {
  const response = await owner.rpc("remove_org_member", { target_user_id: ownerId, replacement_user_id: null });
  assert(Boolean(response.error), "Owner self-removal was unexpectedly allowed");
});

await test("owner cannot remove user from another organization", async () => {
  const response = await owner.rpc("remove_org_member", { target_user_id: outsiderId, replacement_user_id: null });
  assert(Boolean(response.error), "Cross-tenant member removal was unexpectedly allowed");
});

console.log(JSON.stringify({ status: "passed", tests: results, sensitiveValuesPrinted: false }, null, 2));
await owner.auth.signOut(); await outsider.auth.signOut();

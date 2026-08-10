import { describe, expect, it } from "vitest";
import { extractMetaMessages, sanitizeMetaReferral } from "./meta-webhook.service";

describe("Meta WhatsApp webhook normalization", () => {
  it("keeps only the referral fields required for campaign attribution", () => {
    expect(sanitizeMetaReferral({
      ctwa_clid: "click-123",
      source_id: "ad-456",
      headline: "Campanha",
      unsupported_private_field: "must-not-be-stored"
    })).toEqual({ ctwa_clid: "click-123", source_id: "ad-456", headline: "Campanha" });
  });

  it("extracts official WhatsApp messages and ignores unrelated changes", () => {
    const messages = extractMetaMessages({
      object: "whatsapp_business_account",
      entry: [{
        id: "waba-1",
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "phone-1", display_phone_number: "5511999999999" },
            messages: [{
              id: "wamid.1",
              from: "5511888888888",
              timestamp: "1786370000",
              type: "text",
              referral: { ctwa_clid: "click-1", source_id: "ad-1", secret: "discard" }
            }]
          }
        }, { field: "statuses", value: {} }]
      }]
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      phoneNumberId: "phone-1",
      businessAccountId: "waba-1",
      providerEventId: "wamid.1",
      sanitizedPayload: { referral: { ctwa_clid: "click-1", source_id: "ad-1" } }
    });
  });
});

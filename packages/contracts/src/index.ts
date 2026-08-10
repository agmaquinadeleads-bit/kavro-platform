import { z } from "zod";

export const organizationIdSchema = z.string().uuid();

export const organizationRoleSchema = z.enum(["owner", "admin", "member"]);

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(120)
});

export const organizationSchema = z.object({
  id: organizationIdSchema,
  name: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  role: organizationRoleSchema
});

export const leadSchema = z.object({
  id: z.string().uuid(),
  organizationId: organizationIdSchema,
  name: z.string().trim().min(1).max(160),
  email: z.string().email().nullable(),
  phone: z.string().trim().max(32).nullable(),
  stageId: z.string().uuid(),
  ownerId: z.string().uuid().nullable(),
  valueInCents: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});

export type Lead = z.infer<typeof leadSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const whatsappConnectionStatusSchema = z.enum(["disconnected", "connecting", "qr_code", "connected", "error"]);
export const whatsappProviderSchema = z.enum(["evolution", "whatsapp_cloud"]);
export const whatsappMessageTypeSchema = z.enum(["text", "image", "video", "audio", "document", "sticker", "location", "contact", "reaction", "unknown"]);
export const whatsappMessageStatusSchema = z.enum(["pending", "sent", "delivered", "read", "failed", "received"]);

export const whatsappConnectionSchema = z.object({
  id: z.string().uuid(),
  organizationId: organizationIdSchema,
  provider: whatsappProviderSchema,
  displayName: z.string().trim().min(1).max(100),
  phoneNumber: z.string().max(32).nullable(),
  status: whatsappConnectionStatusSchema,
  isDefault: z.boolean()
});

export const sendWhatsappTextSchema = z.object({
  connectionId: z.string().uuid(),
  leadId: z.string().uuid(),
  text: z.string().trim().min(1).max(20000),
  idempotencyKey: z.string().uuid()
});

export const sendWhatsappMediaSchema = z.object({
  connectionId: z.string().uuid(),
  leadId: z.string().uuid(),
  mediaObjectKey: z.string().min(1).max(500),
  caption: z.string().max(20000).optional(),
  idempotencyKey: z.string().uuid()
});

export type WhatsappConnection = z.infer<typeof whatsappConnectionSchema>;
export type WhatsappConnectionStatus = z.infer<typeof whatsappConnectionStatusSchema>;
export type WhatsappProvider = z.infer<typeof whatsappProviderSchema>;
export type SendWhatsappText = z.infer<typeof sendWhatsappTextSchema>;
export type SendWhatsappMedia = z.infer<typeof sendWhatsappMediaSchema>;

export const attributionChannelSchema = z.enum(["form", "whatsapp", "landing_page", "manual", "import", "api"]);
export const attributionProviderSchema = z.enum(["meta", "google", "direct", "referral", "other"]);

const optionalTrackingValue = z.string().trim().max(500).optional();

export const metaWhatsappReferralSchema = z.object({
  ctwaClid: z.string().trim().max(1000).optional(),
  sourceId: z.string().trim().max(160).optional(),
  sourceType: z.string().trim().max(80).optional(),
  headline: z.string().trim().max(500).optional(),
  body: z.string().trim().max(2000).optional(),
  mediaType: z.string().trim().max(80).optional()
}).strict();

export const attributionTouchInputSchema = z.object({
  leadId: z.string().uuid(),
  channel: attributionChannelSchema,
  provider: attributionProviderSchema.default("other"),
  occurredAt: z.string().datetime().optional(),
  source: z.string().trim().max(200).optional(),
  medium: z.string().trim().max(200).optional(),
  campaignName: optionalTrackingValue,
  campaignId: z.string().trim().max(160).optional(),
  adsetName: optionalTrackingValue,
  adsetId: z.string().trim().max(160).optional(),
  adName: optionalTrackingValue,
  adId: z.string().trim().max(160).optional(),
  utmSource: optionalTrackingValue,
  utmMedium: optionalTrackingValue,
  utmCampaign: optionalTrackingValue,
  utmContent: optionalTrackingValue,
  utmTerm: optionalTrackingValue,
  fbclid: optionalTrackingValue,
  fbc: optionalTrackingValue,
  fbp: optionalTrackingValue,
  ctwaClid: z.string().trim().max(1000).optional(),
  gclid: optionalTrackingValue,
  gbraid: optionalTrackingValue,
  wbraid: optionalTrackingValue,
  landingPath: z.string().trim().max(2048).optional(),
  referrerOrigin: z.string().trim().max(255).optional(),
  formId: z.string().trim().max(160).optional(),
  metaReferral: metaWhatsappReferralSchema.optional(),
  deduplicationKey: z.string().trim().min(16).max(160).optional()
}).strict();

export const conversionEventNameSchema = z.enum(["Lead", "QualifiedLead", "Purchase"]);
export const conversionActionSourceSchema = z.enum(["website", "business_messaging", "offline"]);

export type AttributionChannel = z.infer<typeof attributionChannelSchema>;
export type AttributionProvider = z.infer<typeof attributionProviderSchema>;
export type AttributionTouchInput = z.infer<typeof attributionTouchInputSchema>;
export type MetaWhatsappReferral = z.infer<typeof metaWhatsappReferralSchema>;
export type ConversionEventName = z.infer<typeof conversionEventNameSchema>;
export type ConversionActionSource = z.infer<typeof conversionActionSourceSchema>;

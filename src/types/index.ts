import { z } from 'zod';

export const PlatformSchema = z.enum(['linkedin', 'x', 'meta.instagram', 'meta.facebook']);
export type Platform = z.infer<typeof PlatformSchema>;

export const TargetSchema = z.object({
  platform: PlatformSchema,
  account: z.string().optional(),
});
export type Target = z.infer<typeof TargetSchema>;

export const StorageConfigSchema = z.object({
  posts_root: z.string().default('./posts'),
  media_root: z.string().default('./media'),
});
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const AgeKeyProviderSchema = z.enum(['keychain', 'file', 'env']);
export type AgeKeyProvider = z.infer<typeof AgeKeyProviderSchema>;

export const SecretsConfigSchema = z.object({
  sops_file: z.string().default('./secrets.enc.yaml'),
  age_key_provider: AgeKeyProviderSchema.default('keychain'),
});
export type SecretsConfig = z.infer<typeof SecretsConfigSchema>;

export const ProfileConfigSchema = z.object({
  version: z.number().default(1),
  profile: z.string(),
  default_targets: z.array(TargetSchema).optional(),
  storage: StorageConfigSchema.optional(),
  secrets: SecretsConfigSchema.optional(),
});
export type ProfileConfig = z.infer<typeof ProfileConfigSchema>;

export const AccountSecretSchema = z.object({
  account_id: z.string(),
  label: z.string(),
  refresh_token: z.string(),
  access_token: z.string().optional(),
  token_expires_at: z.string().optional(),
  instagram_business_id: z.string().optional(),
});
export type AccountSecret = z.infer<typeof AccountSecretSchema>;

export const PlatformSecretSchema = z.object({
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  app_id: z.string().optional(),
  app_secret: z.string().optional(),
  accounts: z.array(AccountSecretSchema).default([]),
});
export type PlatformSecret = z.infer<typeof PlatformSecretSchema>;

export const SecretsFileSchema = z.object({
  version: z.number().default(1),
  platforms: z.record(z.string(), PlatformSecretSchema).default({}),
});
export type SecretsFile = z.infer<typeof SecretsFileSchema>;

export const MediaItemSchema = z.object({
  type: z.enum(['image', 'video']),
  path: z.string(),
  alt: z.string().optional(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const LinkSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});
export type Link = z.infer<typeof LinkSchema>;

export const PostContentSchema = z.object({
  text: z.string(),
  link: LinkSchema.optional(),
  media: z.array(MediaItemSchema).optional(),
});
export type PostContent = z.infer<typeof PostContentSchema>;

export const PostOptionsSchema = z.object({
  schedule_at: z.string().nullable().optional(),
  dry_run: z.boolean().default(false),
});
export type PostOptions = z.infer<typeof PostOptionsSchema>;

export const PlatformOverrideSchema = z.object({
  text: z.string().optional(),
  link: LinkSchema.optional(),
  media: z.array(MediaItemSchema).optional(),
});
export type PlatformOverride = z.infer<typeof PlatformOverrideSchema>;

export const PostIntentSchema = z.object({
  version: z.number().default(1),
  id: z.string(),
  as_profile: z.string().optional(),
  targets: z.array(TargetSchema).optional(),
  content: PostContentSchema,
  options: PostOptionsSchema.optional(),
  platform_overrides: z.record(z.string(), PlatformOverrideSchema).optional(),
});
export type PostIntent = z.infer<typeof PostIntentSchema>;

export const PublishResultSchema = z.object({
  platform: z.string(),
  account: z.string(),
  remote_post_id: z.string().optional(),
  url: z.string().optional(),
  status: z.enum(['published', 'failed', 'skipped']),
  error: z.string().optional(),
});
export type PublishResult = z.infer<typeof PublishResultSchema>;

export const ReceiptSchema = z.object({
  version: z.number().default(1),
  post_id: z.string(),
  profile: z.string(),
  published_at: z.string(),
  results: z.array(PublishResultSchema),
  hash: z.object({
    intent_sha256: z.string(),
  }),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const ActivityTypeSchema = z.enum(['comment', 'like', 'share', 'mention', 'reply']);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

export const ActivityItemSchema = z.object({
  platform: z.string(),
  type: ActivityTypeSchema,
  post_id: z.string(),
  activity_id: z.string(),
  actor: z.string(),
  actor_name: z.string().optional(),
  text: z.string().optional(),
  created_at: z.string(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const ActivityCursorsSchema = z.record(z.string(), z.string());
export type ActivityCursors = z.infer<typeof ActivityCursorsSchema>;

export const ReplyIntentSchema = z.object({
  version: z.number().default(1),
  in_reply_to: z.object({
    platform: z.string(),
    remote_post_id: z.string(),
    remote_comment_id: z.string().nullable().optional(),
  }),
  content: z.object({
    text: z.string(),
  }),
});
export type ReplyIntent = z.infer<typeof ReplyIntentSchema>;

export const GlobalConfigSchema = z.object({
  current_profile: z.string().optional(),
  profiles_root: z.string().default('./profiles'),
});
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export interface ConnectorLinkResult {
  success: boolean;
  account_id?: string;
  label?: string;
  refresh_token?: string;
  access_token?: string;
  expires_at?: string;
  error?: string;
}

export interface ConnectorPublishResult {
  success: boolean;
  remote_post_id?: string;
  url?: string;
  error?: string;
}

export interface ConnectorActivityResult {
  success: boolean;
  items: ActivityItem[];
  cursor?: string;
  error?: string;
}

export interface ConnectorReplyResult {
  success: boolean;
  remote_reply_id?: string;
  error?: string;
}

export interface Connector {
  platform: Platform;
  
  linkStart(): Promise<{ auth_url: string; state: string }>;
  linkFinish(code: string, state: string): Promise<ConnectorLinkResult>;
  
  publishPost(
    intent: PostIntent,
    account: AccountSecret,
    credentials: PlatformSecret
  ): Promise<ConnectorPublishResult>;
  
  fetchActivity(
    account: AccountSecret,
    credentials: PlatformSecret,
    cursor?: string
  ): Promise<ConnectorActivityResult>;
  
  reply(
    intent: ReplyIntent,
    account: AccountSecret,
    credentials: PlatformSecret
  ): Promise<ConnectorReplyResult>;
}

export class SocialCtlError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SocialCtlError';
  }
}

export class ProfileNotFoundError extends SocialCtlError {
  constructor(profile: string) {
    super(`Profile not found: ${profile}`, 'PROFILE_NOT_FOUND', { profile });
    this.name = 'ProfileNotFoundError';
  }
}

export class SecretsDecryptionError extends SocialCtlError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SECRETS_DECRYPTION_ERROR', details);
    this.name = 'SecretsDecryptionError';
  }
}

export class ValidationError extends SocialCtlError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ConnectorError extends SocialCtlError {
  constructor(platform: string, message: string, details?: Record<string, unknown>) {
    super(message, 'CONNECTOR_ERROR', { platform, ...details });
    this.name = 'ConnectorError';
  }
}

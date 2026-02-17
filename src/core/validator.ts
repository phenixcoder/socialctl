import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ZodError } from 'zod';
import {
  PostIntent,
  PostIntentSchema,
  ProfileConfig,
  Target,
} from '../types/index.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const PLATFORM_CONSTRAINTS: Record<string, { maxTextLength: number; maxMediaCount: number }> = {
  'linkedin': { maxTextLength: 3000, maxMediaCount: 20 },
  'x': { maxTextLength: 280, maxMediaCount: 4 },
  'meta.instagram': { maxTextLength: 2200, maxMediaCount: 10 },
  'meta.facebook': { maxTextLength: 63206, maxMediaCount: 10 },
};

export function validatePostIntent(
  intent: PostIntent,
  profile: ProfileConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    PostIntentSchema.parse(intent);
  } catch (err) {
    if (err instanceof ZodError) {
      for (const issue of err.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    }
  }
  
  if (!intent.content?.text) {
    errors.push('content.text is required');
  }
  
  const targets = intent.targets || profile.default_targets || [];
  if (targets.length === 0) {
    errors.push('No targets specified and no default_targets in profile');
  }
  
  for (const target of targets) {
    const constraints = PLATFORM_CONSTRAINTS[target.platform];
    if (!constraints) {
      warnings.push(`Unknown platform: ${target.platform}`);
      continue;
    }
    
    const text = getTextForPlatform(intent, target.platform);
    if (text.length > constraints.maxTextLength) {
      errors.push(
        `Text too long for ${target.platform}: ${text.length}/${constraints.maxTextLength} chars`
      );
    }
    
    const media = intent.content.media || [];
    if (media.length > constraints.maxMediaCount) {
      errors.push(
        `Too many media items for ${target.platform}: ${media.length}/${constraints.maxMediaCount}`
      );
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function validateMediaFiles(
  intent: PostIntent,
  profileDir: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const mediaItems = intent.content.media || [];
  
  for (const media of mediaItems) {
    const mediaPath = path.resolve(profileDir, media.path);
    
    try {
      const stat = await fs.stat(mediaPath);
      
      if (media.type === 'image') {
        const maxSize = 20 * 1024 * 1024;
        if (stat.size > maxSize) {
          errors.push(`Image file too large: ${media.path} (${(stat.size / 1024 / 1024).toFixed(1)}MB > 20MB)`);
        }
      } else if (media.type === 'video') {
        const maxSize = 512 * 1024 * 1024;
        if (stat.size > maxSize) {
          errors.push(`Video file too large: ${media.path} (${(stat.size / 1024 / 1024).toFixed(1)}MB > 512MB)`);
        }
      }
      
      if (!media.alt) {
        warnings.push(`Missing alt text for media: ${media.path}`);
      }
    } catch {
      errors.push(`Media file not found: ${media.path}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function getTextForPlatform(intent: PostIntent, platform: string): string {
  const override = intent.platform_overrides?.[platform];
  return override?.text || intent.content.text;
}

export function getTargetsForIntent(intent: PostIntent, profile: ProfileConfig): Target[] {
  return intent.targets || profile.default_targets || [];
}

export function mergeValidationResults(...results: ValidationResult[]): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  
  for (const result of results) {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

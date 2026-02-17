import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Receipt, ReceiptSchema, PostIntent, PublishResult } from '../types/index.js';

export function generateIntentHash(intent: PostIntent): string {
  const normalized = JSON.stringify(intent, Object.keys(intent).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function createReceipt(
  intent: PostIntent,
  profile: string,
  results: PublishResult[]
): Receipt {
  return ReceiptSchema.parse({
    version: 1,
    post_id: intent.id,
    profile,
    published_at: new Date().toISOString(),
    results,
    hash: {
      intent_sha256: generateIntentHash(intent),
    },
    warnings: [],
    errors: results.filter(r => r.status === 'failed').map(r => r.error || 'Unknown error'),
  });
}

export function getReceiptPath(postFilePath: string): string {
  const dir = path.dirname(postFilePath);
  const basename = path.basename(postFilePath, '.yaml');
  const postedDir = path.join(dir, 'posted');
  return path.join(postedDir, `${basename}.receipt.json`);
}

export async function saveReceipt(receipt: Receipt, postFilePath: string): Promise<string> {
  const receiptPath = getReceiptPath(postFilePath);
  const receiptDir = path.dirname(receiptPath);
  
  await fs.mkdir(receiptDir, { recursive: true });
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), 'utf-8');
  
  return receiptPath;
}

export async function loadReceipt(postFilePath: string): Promise<Receipt | null> {
  const receiptPath = getReceiptPath(postFilePath);
  
  try {
    const content = await fs.readFile(receiptPath, 'utf-8');
    return ReceiptSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

export async function receiptExists(postFilePath: string): Promise<boolean> {
  const receiptPath = getReceiptPath(postFilePath);
  try {
    await fs.access(receiptPath);
    return true;
  } catch {
    return false;
  }
}

export function getPublishedPlatforms(receipt: Receipt): string[] {
  return receipt.results
    .filter(r => r.status === 'published')
    .map(r => r.platform);
}

export function shouldSkipPlatform(
  receipt: Receipt | null,
  platform: string,
  republish: boolean
): boolean {
  if (!receipt || republish) {
    return false;
  }
  
  const published = getPublishedPlatforms(receipt);
  return published.includes(platform);
}

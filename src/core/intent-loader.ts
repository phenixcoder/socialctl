import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import { PostIntent, PostIntentSchema, ValidationError } from '../types/index.js';

export async function loadPostIntent(filePath: string): Promise<PostIntent> {
  const absolutePath = path.resolve(filePath);
  
  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const data = YAML.parse(content);
    return PostIntentSchema.parse(data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ValidationError(`Post file not found: ${filePath}`);
    }
    throw err;
  }
}

export function getPostDirectory(profileDir: string, date: Date = new Date()): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return path.join(profileDir, 'posts', year, month, day);
}

export async function savePostIntent(
  intent: PostIntent,
  profileDir: string,
  filename: string
): Promise<string> {
  const postDir = getPostDirectory(profileDir);
  await fs.mkdir(postDir, { recursive: true });
  
  const filePath = path.join(postDir, `${filename}.yaml`);
  const content = YAML.stringify(intent);
  await fs.writeFile(filePath, content, 'utf-8');
  
  return filePath;
}

export async function listPostFiles(
  profileDir: string,
  options: { since?: Date; includePosted?: boolean } = {}
): Promise<string[]> {
  const postsRoot = path.join(profileDir, 'posts');
  const postFiles: string[] = [];
  
  async function scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name === 'posted' && !options.includePosted) {
            continue;
          }
          await scanDirectory(fullPath);
        } else if (entry.name.endsWith('.yaml') && !entry.name.endsWith('.receipt.yaml')) {
          if (options.since) {
            const stat = await fs.stat(fullPath);
            if (stat.mtime >= options.since) {
              postFiles.push(fullPath);
            }
          } else {
            postFiles.push(fullPath);
          }
        }
      }
    } catch {
      return;
    }
  }
  
  await scanDirectory(postsRoot);
  return postFiles.sort();
}

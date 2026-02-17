import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import {
  SecretsFile,
  SecretsFileSchema,
  AgeKeyProvider,
  SecretsDecryptionError,
} from '../types/index.js';

const CONFIG_DIR = path.join(process.env.HOME || '~', '.config', 'socialctl');
const AGE_KEY_FILE = path.join(CONFIG_DIR, 'age', 'key.txt');

export async function getAgeKey(provider: AgeKeyProvider): Promise<string> {
  switch (provider) {
    case 'env': {
      const key = process.env.SOCIALCTL_AGE_KEY;
      if (!key) {
        throw new SecretsDecryptionError('SOCIALCTL_AGE_KEY environment variable not set');
      }
      return key;
    }
    
    case 'file': {
      try {
        const key = await fs.readFile(AGE_KEY_FILE, 'utf-8');
        return key.trim();
      } catch {
        throw new SecretsDecryptionError(`Age key file not found: ${AGE_KEY_FILE}`);
      }
    }
    
    case 'keychain': {
      return await getKeyFromKeychain();
    }
  }
}

async function getKeyFromKeychain(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('security', [
      'find-generic-password',
      '-s', 'socialctl-age-key',
      '-w',
    ]);
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new SecretsDecryptionError(
          'Failed to get age key from keychain. Run "socialctl key init" first.',
          { stderr }
        ));
      }
    });
  });
}

export async function setKeyInKeychain(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('security', [
      'add-generic-password',
      '-s', 'socialctl-age-key',
      '-a', process.env.USER || 'socialctl',
      '-w', key,
      '-U',
    ]);
    
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new SecretsDecryptionError('Failed to store age key in keychain', { stderr }));
      }
    });
  });
}

export async function saveKeyToFile(key: string): Promise<void> {
  const keyDir = path.dirname(AGE_KEY_FILE);
  await fs.mkdir(keyDir, { recursive: true });
  await fs.writeFile(AGE_KEY_FILE, key, { mode: 0o600 });
}

export async function decryptSecretsFile(
  encryptedPath: string,
  ageKey: string
): Promise<SecretsFile> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sops', [
      '--decrypt',
      '--input-type', 'yaml',
      '--output-type', 'yaml',
      encryptedPath,
    ], {
      env: {
        ...process.env,
        SOPS_AGE_KEY: ageKey,
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const data = YAML.parse(stdout);
          resolve(SecretsFileSchema.parse(data));
        } catch (err) {
          reject(new SecretsDecryptionError('Failed to parse decrypted secrets', { 
            error: String(err) 
          }));
        }
      } else {
        reject(new SecretsDecryptionError('SOPS decryption failed', { stderr }));
      }
    });
    
    proc.on('error', (err) => {
      reject(new SecretsDecryptionError(
        'SOPS not found. Install it with: brew install sops',
        { error: String(err) }
      ));
    });
  });
}

export async function encryptSecretsFile(
  secrets: SecretsFile,
  outputPath: string,
  agePublicKey: string
): Promise<void> {
  const yamlContent = YAML.stringify(secrets);
  
  return new Promise((resolve, reject) => {
    const proc = spawn('sops', [
      '--encrypt',
      '--input-type', 'yaml',
      '--output-type', 'yaml',
      '--age', agePublicKey,
      '/dev/stdin',
    ]);
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', async (code) => {
      if (code === 0) {
        await fs.writeFile(outputPath, stdout, 'utf-8');
        resolve();
      } else {
        reject(new SecretsDecryptionError('SOPS encryption failed', { stderr }));
      }
    });
    
    proc.stdin.write(yamlContent);
    proc.stdin.end();
  });
}

export async function generateAgeKey(): Promise<{ privateKey: string; publicKey: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('age-keygen');
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code === 0) {
        const publicKeyMatch = stderr.match(/public key: (age1[a-z0-9]+)/);
        if (publicKeyMatch) {
          resolve({
            privateKey: stdout.trim(),
            publicKey: publicKeyMatch[1],
          });
        } else {
          reject(new SecretsDecryptionError('Failed to parse age-keygen output'));
        }
      } else {
        reject(new SecretsDecryptionError(
          'age-keygen not found. Install it with: brew install age',
          { stderr }
        ));
      }
    });
    
    proc.on('error', (err) => {
      reject(new SecretsDecryptionError(
        'age-keygen not found. Install it with: brew install age',
        { error: String(err) }
      ));
    });
  });
}

export async function keyExists(provider: AgeKeyProvider): Promise<boolean> {
  try {
    await getAgeKey(provider);
    return true;
  } catch {
    return false;
  }
}

import { Command } from 'commander';
import { createServer } from 'node:http';
import { getResolvedProfile, getProfileDir } from '../../core/profile-loader.js';
import { getAgeKey, decryptSecretsFile, encryptSecretsFile } from '../../core/sops-helper.js';
import { getConnector, hasConnector } from '../../connectors/base.js';
import { Platform, SecretsFile } from '../../types/index.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export const accountCommand = new Command('account')
  .description('Manage linked accounts');

accountCommand
  .command('list')
  .description('List linked accounts for a profile')
  .option('-p, --profile <name>', 'Profile to use')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const { name: profileName, config: profile } = await getResolvedProfile(options.profile);
      const profileDir = getProfileDir(profileName);
      
      const secretsConfig = profile.secrets || { sops_file: './secrets.enc.yaml', age_key_provider: 'keychain' };
      const secretsPath = path.resolve(profileDir, secretsConfig.sops_file);
      
      let secrets;
      try {
        const ageKey = await getAgeKey(secretsConfig.age_key_provider);
        secrets = await decryptSecretsFile(secretsPath, ageKey);
      } catch {
        if (options.json) {
          console.log(JSON.stringify({ accounts: [], error: 'No secrets file or decryption failed' }));
        } else {
          console.log('No accounts configured yet.');
          console.log('Run "socialctl account link <platform>" to link an account.');
        }
        return;
      }
      
      const accounts: Array<{ platform: string; account_id: string; label: string }> = [];
      
      for (const [platform, platformSecrets] of Object.entries(secrets.platforms)) {
        for (const account of platformSecrets.accounts) {
          accounts.push({
            platform,
            account_id: account.account_id,
            label: account.label,
          });
        }
      }
      
      if (options.json) {
        console.log(JSON.stringify({ accounts }, null, 2));
        return;
      }
      
      if (accounts.length === 0) {
        console.log('No accounts linked.');
        console.log('Run "socialctl account link <platform>" to link an account.');
        return;
      }
      
      console.log(`Accounts for profile "${profileName}":`);
      for (const account of accounts) {
        console.log(`  ${account.platform}: ${account.label} (${account.account_id})`);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

accountCommand
  .command('link <platform>')
  .description('Link a new account')
  .option('-p, --profile <name>', 'Profile to use')
  .option('--port <number>', 'Callback server port', '3000')
  .action(async (platform, options) => {
    try {
      const { name: profileName, config: profile } = await getResolvedProfile(options.profile);
      const profileDir = getProfileDir(profileName);
      
      const normalizedPlatform = platform as Platform;
      
      if (!hasConnector(normalizedPlatform)) {
        console.error(`No connector available for platform: ${platform}`);
        console.error('Available platforms: meta.instagram, meta.facebook');
        process.exit(1);
      }
      
      const connector = getConnector(normalizedPlatform);
      
      console.log(`Linking ${platform} account to profile "${profileName}"...`);
      console.log('');
      
      const { auth_url, state } = await connector.linkStart();
      
      console.log('Open this URL in your browser to authorize:');
      console.log('');
      console.log(`  ${auth_url}`);
      console.log('');
      console.log(`Waiting for callback on port ${options.port}...`);
      
      const result = await waitForOAuthCallback(parseInt(options.port, 10), state, connector);
      
      if (!result.success) {
        console.error(`\nFailed to link account: ${result.error}`);
        process.exit(1);
      }
      
      const secretsConfig = profile.secrets || { sops_file: './secrets.enc.yaml', age_key_provider: 'keychain' as const };
      const secretsPath = path.resolve(profileDir, secretsConfig.sops_file);
      
      let secrets: SecretsFile;
      let ageKey: string;
      let agePublicKey: string;
      
      try {
        ageKey = await getAgeKey(secretsConfig.age_key_provider);
        const keyLines = ageKey.split('\n');
        const publicKeyLine = keyLines.find(l => l.startsWith('# public key:'));
        agePublicKey = publicKeyLine ? publicKeyLine.replace('# public key: ', '').trim() : '';
        
        if (!agePublicKey) {
          const privateKeyLine = keyLines.find(l => l.startsWith('AGE-SECRET-KEY-'));
          if (privateKeyLine) {
            const { execSync } = await import('node:child_process');
            const output = execSync(`echo "${privateKeyLine}" | age-keygen -y`, { encoding: 'utf-8' });
            agePublicKey = output.trim();
          }
        }
      } catch {
        console.error('No age key found. Run "socialctl key init" first.');
        process.exit(1);
      }
      
      try {
        secrets = await decryptSecretsFile(secretsPath, ageKey);
      } catch {
        secrets = { version: 1, platforms: {} };
      }
      
      const platformKey = platform.startsWith('meta.') ? 'meta' : platform;
      
      if (!secrets.platforms[platformKey]) {
        secrets.platforms[platformKey] = { accounts: [] };
      }
      
      const existingIndex = secrets.platforms[platformKey].accounts.findIndex(
        a => a.account_id === result.account_id
      );
      
      const accountData = {
        account_id: result.account_id!,
        label: result.label!,
        refresh_token: result.refresh_token!,
        access_token: result.access_token,
        token_expires_at: result.expires_at,
        instagram_business_id: platform === 'meta.instagram' ? result.account_id : undefined,
      };
      
      if (existingIndex >= 0) {
        secrets.platforms[platformKey].accounts[existingIndex] = accountData;
      } else {
        secrets.platforms[platformKey].accounts.push(accountData);
      }
      
      await fs.mkdir(path.dirname(secretsPath), { recursive: true });
      await encryptSecretsFile(secrets, secretsPath, agePublicKey);
      
      console.log('');
      console.log(`✓ Successfully linked ${platform} account: ${result.label}`);
      console.log(`  Account ID: ${result.account_id}`);
      console.log(`  Credentials saved to: ${secretsPath}`);
      
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

async function waitForOAuthCallback(
  port: number,
  expectedState: string,
  connector: ReturnType<typeof getConnector>
): Promise<{
  success: boolean;
  account_id?: string;
  label?: string;
  refresh_token?: string;
  access_token?: string;
  expires_at?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://localhost:${port}`);
      
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1 style="color: #dc3545;">Authorization Failed</h1>
              <p>${errorDescription || error}</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        resolve({ success: false, error: errorDescription || error });
        return;
      }
      
      if (!code || state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1 style="color: #dc3545;">Invalid Callback</h1>
              <p>Missing or invalid parameters.</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        resolve({ success: false, error: 'Invalid callback parameters' });
        return;
      }
      
      const result = await connector.linkFinish(code, state);
      
      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1 style="color: #28a745;">Success!</h1>
              <p>Account linked: ${result.label}</p>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1 style="color: #dc3545;">Failed</h1>
              <p>${result.error}</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
      }
      
      server.close();
      resolve(result);
    });
    
    server.listen(port, () => {});
    
    server.on('error', (err) => {
      resolve({ success: false, error: `Failed to start callback server: ${err.message}` });
    });
  });
}

accountCommand
  .command('whoami <platform>')
  .description('Show the account info for a platform')
  .option('-p, --profile <name>', 'Profile to use')
  .option('--json', 'Output as JSON')
  .action(async (platform, options) => {
    try {
      const { name: profileName, config: profile } = await getResolvedProfile(options.profile);
      const profileDir = getProfileDir(profileName);
      
      const secretsConfig = profile.secrets || { sops_file: './secrets.enc.yaml', age_key_provider: 'keychain' };
      const secretsPath = path.resolve(profileDir, secretsConfig.sops_file);
      
      let secrets;
      try {
        const ageKey = await getAgeKey(secretsConfig.age_key_provider);
        secrets = await decryptSecretsFile(secretsPath, ageKey);
      } catch {
        console.error(`No ${platform} account linked.`);
        process.exit(1);
      }
      
      const platformSecrets = secrets.platforms[platform];
      if (!platformSecrets || platformSecrets.accounts.length === 0) {
        console.error(`No ${platform} account linked.`);
        process.exit(1);
      }
      
      const account = platformSecrets.accounts[0];
      
      if (options.json) {
        console.log(JSON.stringify({
          platform,
          account_id: account.account_id,
          label: account.label,
        }, null, 2));
        return;
      }
      
      console.log(`Platform: ${platform}`);
      console.log(`Account: ${account.label}`);
      console.log(`ID: ${account.account_id}`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

import { Command } from 'commander';
import { getResolvedProfile, getProfileDir } from '../../core/profile-loader.js';
import { getAgeKey, decryptSecretsFile } from '../../core/sops-helper.js';
import * as path from 'node:path';

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
  .action(async (platform, options) => {
    try {
      const { name: profileName } = await getResolvedProfile(options.profile);
      
      console.log(`Linking ${platform} account to profile "${profileName}"...`);
      console.log('');
      console.log('OAuth flow is not yet implemented.');
      console.log('');
      console.log('Manual setup instructions:');
      console.log(`  1. Create a ${platform} developer app`);
      console.log('  2. Get your client_id and client_secret');
      console.log('  3. Complete OAuth flow to get refresh_token');
      console.log(`  4. Add credentials to profiles/${profileName}/secrets.enc.yaml`);
      console.log('');
      console.log('See SPEC.md for the secrets file format.');
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

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

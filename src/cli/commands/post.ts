import { Command } from 'commander';
import * as path from 'node:path';
import { loadPostIntent } from '../../core/intent-loader.js';
import {
  validatePostIntent,
  validateMediaFiles,
  mergeValidationResults,
} from '../../core/validator.js';
import {
  loadReceipt,
  receiptExists,
  createReceipt,
  saveReceipt,
  shouldSkipPlatform,
} from '../../core/receipt-writer.js';
import {
  getResolvedProfile,
  getProfileDir,
} from '../../core/profile-loader.js';
import { getConnector, hasConnector } from '../../connectors/base.js';
import { getAgeKey, decryptSecretsFile } from '../../core/sops-helper.js';
import { Platform, PublishResult, Target } from '../../types/index.js';

export const postCommand = new Command('post')
  .description('Manage posts');

postCommand
  .command('validate')
  .description('Validate a post file')
  .requiredOption('-f, --file <path>', 'Path to the post YAML file')
  .option('-p, --profile <name>', 'Profile to use')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const { name: profileName, config: profile } = await getResolvedProfile(options.profile);
      const profileDir = getProfileDir(profileName);
      
      const intent = await loadPostIntent(options.file);
      
      const schemaResult = validatePostIntent(intent, profile);
      const mediaResult = await validateMediaFiles(intent, profileDir);
      const result = mergeValidationResults(schemaResult, mediaResult);
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
      }
      
      if (result.valid) {
        console.log('✓ Post is valid');
        if (result.warnings.length > 0) {
          console.log('\nWarnings:');
          for (const warning of result.warnings) {
            console.log(`  ⚠ ${warning}`);
          }
        }
      } else {
        console.log('✗ Post validation failed');
        console.log('\nErrors:');
        for (const error of result.errors) {
          console.log(`  ✗ ${error}`);
        }
        if (result.warnings.length > 0) {
          console.log('\nWarnings:');
          for (const warning of result.warnings) {
            console.log(`  ⚠ ${warning}`);
          }
        }
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

postCommand
  .command('status')
  .description('Check the publishing status of a post')
  .requiredOption('-f, --file <path>', 'Path to the post YAML file')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const intent = await loadPostIntent(options.file);
      const hasReceipt = await receiptExists(options.file);
      
      if (options.json) {
        if (hasReceipt) {
          const receipt = await loadReceipt(options.file);
          console.log(JSON.stringify({ status: 'published', receipt }, null, 2));
        } else {
          console.log(JSON.stringify({ status: 'pending', post_id: intent.id }));
        }
        return;
      }
      
      console.log(`Post: ${intent.id}`);
      
      if (hasReceipt) {
        const receipt = await loadReceipt(options.file);
        if (receipt) {
          console.log(`Status: Published`);
          console.log(`Published at: ${receipt.published_at}`);
          console.log('\nResults:');
          for (const result of receipt.results) {
            const statusIcon = result.status === 'published' ? '✓' : '✗';
            console.log(`  ${statusIcon} ${result.platform} (${result.account}): ${result.status}`);
            if (result.url) {
              console.log(`    URL: ${result.url}`);
            }
            if (result.error) {
              console.log(`    Error: ${result.error}`);
            }
          }
        }
      } else {
        console.log('Status: Pending (not yet published)');
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

postCommand
  .command('publish')
  .description('Publish a post to configured platforms')
  .requiredOption('-f, --file <path>', 'Path to the post YAML file')
  .option('-p, --profile <name>', 'Profile to use')
  .option('--dry-run', 'Validate without publishing')
  .option('--republish', 'Republish even if already published')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const { name: profileName, config: profile } = await getResolvedProfile(options.profile);
      const profileDir = getProfileDir(profileName);
      
      const intent = await loadPostIntent(options.file);
      
      const schemaResult = validatePostIntent(intent, profile);
      const mediaResult = await validateMediaFiles(intent, profileDir);
      const validationResult = mergeValidationResults(schemaResult, mediaResult);
      
      if (!validationResult.valid) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, validation: validationResult }, null, 2));
        } else {
          console.error('Validation failed:');
          for (const error of validationResult.errors) {
            console.error(`  ✗ ${error}`);
          }
        }
        process.exit(1);
      }
      
      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ 
            success: true, 
            dry_run: true, 
            validation: validationResult 
          }, null, 2));
        } else {
          console.log('✓ Dry run successful - post is valid and ready to publish');
        }
        return;
      }
      
      const existingReceipt = await loadReceipt(options.file);
      if (existingReceipt && !options.republish) {
        const allPublished = existingReceipt.results.every(r => r.status === 'published');
        if (allPublished) {
          if (options.json) {
            console.log(JSON.stringify({ 
              success: false, 
              error: 'Already published. Use --republish to override.',
              receipt: existingReceipt
            }, null, 2));
          } else {
            console.log('Post already published. Use --republish to publish again.');
            console.log(`Published at: ${existingReceipt.published_at}`);
          }
          process.exit(1);
        }
      }
      
      const targets: Target[] = intent.targets || profile.default_targets || [];
      
      if (targets.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: 'No targets specified' }, null, 2));
        } else {
          console.error('No targets specified. Add targets to post file or set default_targets in profile.');
        }
        process.exit(1);
      }
      
      const secretsConfig = profile.secrets || { sops_file: './secrets.enc.yaml', age_key_provider: 'keychain' as const };
      const secretsPath = path.resolve(profileDir, secretsConfig.sops_file);
      
      let secrets;
      try {
        const ageKey = await getAgeKey(secretsConfig.age_key_provider);
        secrets = await decryptSecretsFile(secretsPath, ageKey);
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Failed to decrypt secrets: ${(err as Error).message}` }, null, 2));
        } else {
          console.error(`Failed to decrypt secrets: ${(err as Error).message}`);
          console.error('Run "socialctl key init" and "socialctl account link <platform>" first.');
        }
        process.exit(1);
      }
      
      const results: PublishResult[] = [];
      
      for (const target of targets) {
        const platform = target.platform as Platform;
        
        if (shouldSkipPlatform(existingReceipt, platform, options.republish)) {
          if (!options.json) {
            console.log(`⊘ ${platform}: Skipped (already published)`);
          }
          const existingResult = existingReceipt?.results.find(r => r.platform === platform);
          if (existingResult) {
            results.push(existingResult);
          }
          continue;
        }
        
        if (!hasConnector(platform)) {
          const result: PublishResult = {
            platform,
            account: target.account || 'default',
            status: 'failed',
            error: `No connector available for platform: ${platform}`,
          };
          results.push(result);
          if (!options.json) {
            console.log(`✗ ${platform}: No connector available`);
          }
          continue;
        }
        
        const platformKey = platform.startsWith('meta.') ? 'meta' : platform;
        const platformSecrets = secrets.platforms[platformKey];
        
        if (!platformSecrets || platformSecrets.accounts.length === 0) {
          const result: PublishResult = {
            platform,
            account: target.account || 'default',
            status: 'failed',
            error: `No credentials configured for ${platform}. Run "socialctl account link ${platform}"`,
          };
          results.push(result);
          if (!options.json) {
            console.log(`✗ ${platform}: No credentials configured`);
          }
          continue;
        }
        
        const account = target.account
          ? platformSecrets.accounts.find(a => a.label === target.account)
          : platformSecrets.accounts[0];
        
        if (!account) {
          const result: PublishResult = {
            platform,
            account: target.account || 'default',
            status: 'failed',
            error: `Account "${target.account}" not found for ${platform}`,
          };
          results.push(result);
          if (!options.json) {
            console.log(`✗ ${platform}: Account not found`);
          }
          continue;
        }
        
        if (!options.json) {
          process.stdout.write(`◐ ${platform} (${account.label}): Publishing...`);
        }
        
        try {
          const connector = getConnector(platform);
          const publishResult = await connector.publishPost(intent, account, platformSecrets);
          
          if (publishResult.success) {
            const result: PublishResult = {
              platform,
              account: account.label,
              remote_post_id: publishResult.remote_post_id,
              url: publishResult.url,
              status: 'published',
            };
            results.push(result);
            if (!options.json) {
              process.stdout.write(`\r✓ ${platform} (${account.label}): Published\n`);
              if (publishResult.url) {
                console.log(`  URL: ${publishResult.url}`);
              }
            }
          } else {
            const result: PublishResult = {
              platform,
              account: account.label,
              status: 'failed',
              error: publishResult.error,
            };
            results.push(result);
            if (!options.json) {
              process.stdout.write(`\r✗ ${platform} (${account.label}): Failed\n`);
              console.log(`  Error: ${publishResult.error}`);
            }
          }
        } catch (err) {
          const result: PublishResult = {
            platform,
            account: account.label,
            status: 'failed',
            error: (err as Error).message,
          };
          results.push(result);
          if (!options.json) {
            process.stdout.write(`\r✗ ${platform} (${account.label}): Error\n`);
            console.log(`  Error: ${(err as Error).message}`);
          }
        }
      }
      
      const receipt = createReceipt(intent, profileName, results);
      const receiptPath = await saveReceipt(receipt, options.file);
      
      if (options.json) {
        console.log(JSON.stringify({ success: true, receipt, receipt_path: receiptPath }, null, 2));
      } else {
        const successCount = results.filter(r => r.status === 'published').length;
        const failCount = results.filter(r => r.status === 'failed').length;
        console.log(`\nReceipt saved: ${receiptPath}`);
        console.log(`Summary: ${successCount} published, ${failCount} failed`);
      }
      
      const hasFailures = results.some(r => r.status === 'failed');
      if (hasFailures) {
        process.exit(1);
      }
      
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

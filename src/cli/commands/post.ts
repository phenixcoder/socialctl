import { Command } from 'commander';
import { loadPostIntent } from '../../core/intent-loader.js';
import {
  validatePostIntent,
  validateMediaFiles,
  mergeValidationResults,
} from '../../core/validator.js';
import {
  loadReceipt,
  receiptExists,
} from '../../core/receipt-writer.js';
import {
  getResolvedProfile,
  getProfileDir,
} from '../../core/profile-loader.js';

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
      
      console.log('Publishing is not yet implemented. Connectors need to be configured.');
      console.log('Run "socialctl account link <platform>" to set up platform credentials.');
      
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

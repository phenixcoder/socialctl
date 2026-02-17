import { Command } from 'commander';
import {
  generateAgeKey,
  setKeyInKeychain,
  saveKeyToFile,
  keyExists,
  getAgeKey,
} from '../../core/sops-helper.js';
import { AgeKeyProvider } from '../../types/index.js';

export const keyCommand = new Command('key')
  .description('Manage age encryption keys');

keyCommand
  .command('init')
  .description('Initialize a new age encryption key')
  .option('--provider <type>', 'Key storage provider: keychain, file, env', 'keychain')
  .option('--force', 'Overwrite existing key')
  .action(async (options) => {
    const provider = options.provider as AgeKeyProvider;
    
    if (provider === 'env') {
      console.error('Cannot initialize key with env provider.');
      console.error('Set SOCIALCTL_AGE_KEY environment variable manually.');
      process.exit(1);
    }
    
    const exists = await keyExists(provider);
    if (exists && !options.force) {
      console.log('Key already exists. Use --force to regenerate.');
      process.exit(1);
    }
    
    console.log('Generating new age key...');
    const { privateKey, publicKey } = await generateAgeKey();
    
    if (provider === 'keychain') {
      await setKeyInKeychain(privateKey);
      console.log('✓ Private key stored in macOS Keychain');
    } else if (provider === 'file') {
      await saveKeyToFile(privateKey);
      console.log('✓ Private key saved to ~/.config/socialctl/age/key.txt');
    }
    
    console.log('');
    console.log('Public key (add this to your .sops.yaml):');
    console.log(`  ${publicKey}`);
    console.log('');
    console.log('Example .sops.yaml:');
    console.log('  creation_rules:');
    console.log('    - age: ' + publicKey);
  });

keyCommand
  .command('status')
  .description('Check if an age key is configured')
  .option('--provider <type>', 'Key storage provider: keychain, file, env', 'keychain')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const provider = options.provider as AgeKeyProvider;
    const exists = await keyExists(provider);
    
    if (options.json) {
      console.log(JSON.stringify({ 
        provider, 
        configured: exists 
      }));
      return;
    }
    
    if (exists) {
      console.log(`✓ Age key is configured (provider: ${provider})`);
    } else {
      console.log(`✗ No age key found (provider: ${provider})`);
      console.log('Run "socialctl key init" to create one.');
    }
  });

keyCommand
  .command('rotate')
  .description('Rotate the age encryption key')
  .option('--provider <type>', 'Key storage provider: keychain, file', 'keychain')
  .action(async (options) => {
    const provider = options.provider as AgeKeyProvider;
    
    if (provider === 'env') {
      console.error('Cannot rotate key with env provider.');
      process.exit(1);
    }
    
    const exists = await keyExists(provider);
    if (!exists) {
      console.error('No existing key found. Run "socialctl key init" first.');
      process.exit(1);
    }
    
    console.log('⚠ Key rotation requires re-encrypting all secrets files.');
    console.log('This feature is not yet implemented.');
    console.log('');
    console.log('Manual steps:');
    console.log('  1. Generate new key: socialctl key init --force');
    console.log('  2. Decrypt secrets with old key');
    console.log('  3. Re-encrypt with new key');
  });

keyCommand
  .command('export')
  .description('Export the public key')
  .option('--provider <type>', 'Key storage provider: keychain, file, env', 'keychain')
  .action(async (options) => {
    const provider = options.provider as AgeKeyProvider;
    
    try {
      const privateKey = await getAgeKey(provider);
      const publicKeyMatch = privateKey.match(/# public key: (age1[a-z0-9]+)/);
      
      if (publicKeyMatch) {
        console.log(publicKeyMatch[1]);
      } else {
        console.error('Could not extract public key from stored key.');
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

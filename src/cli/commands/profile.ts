import { Command } from 'commander';
import {
  listProfiles,
  getCurrentProfile,
  setCurrentProfile,
  profileExists,
  createProfile,
} from '../../core/profile-loader.js';

export const profileCommand = new Command('profile')
  .description('Manage profiles');

profileCommand
  .command('list')
  .description('List all available profiles')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const profiles = await listProfiles();
    const current = await getCurrentProfile();
    
    if (options.json) {
      console.log(JSON.stringify({ profiles, current }, null, 2));
      return;
    }
    
    if (profiles.length === 0) {
      console.log('No profiles found. Create one with: socialctl profile create <name>');
      return;
    }
    
    console.log('Profiles:');
    for (const profile of profiles) {
      const marker = profile === current ? ' (active)' : '';
      console.log(`  ${profile}${marker}`);
    }
  });

profileCommand
  .command('use <profile>')
  .description('Set the active profile')
  .action(async (profile) => {
    const exists = await profileExists(profile);
    if (!exists) {
      console.error(`Profile not found: ${profile}`);
      console.error('Available profiles:');
      const profiles = await listProfiles();
      for (const p of profiles) {
        console.error(`  ${p}`);
      }
      process.exit(1);
    }
    
    await setCurrentProfile(profile);
    console.log(`Switched to profile: ${profile}`);
  });

profileCommand
  .command('create <name>')
  .description('Create a new profile')
  .action(async (name) => {
    const exists = await profileExists(name);
    if (exists) {
      console.error(`Profile already exists: ${name}`);
      process.exit(1);
    }
    
    await createProfile(name);
    console.log(`Created profile: ${name}`);
    console.log(`Profile directory: profiles/${name}/`);
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Edit profiles/${name}/profile.yaml to configure default targets`);
    console.log('  2. Run "socialctl key init" to set up encryption');
    console.log('  3. Link accounts with "socialctl account link <platform>"');
  });

profileCommand
  .command('current')
  .description('Show the current active profile')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const current = await getCurrentProfile();
    
    if (options.json) {
      console.log(JSON.stringify({ current: current || null }));
      return;
    }
    
    if (current) {
      console.log(current);
    } else {
      console.log('No active profile. Set one with: socialctl profile use <profile>');
    }
  });

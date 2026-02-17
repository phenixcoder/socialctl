import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import {
  ProfileConfig,
  ProfileConfigSchema,
  GlobalConfig,
  GlobalConfigSchema,
  ProfileNotFoundError,
} from '../types/index.js';

const CONFIG_DIR = path.join(process.env.HOME || '~', '.config', 'socialctl');
const GLOBAL_CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  try {
    const content = await fs.readFile(GLOBAL_CONFIG_FILE, 'utf-8');
    const data = YAML.parse(content);
    return GlobalConfigSchema.parse(data);
  } catch {
    return GlobalConfigSchema.parse({});
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await ensureConfigDir();
  const content = YAML.stringify(config);
  await fs.writeFile(GLOBAL_CONFIG_FILE, content, 'utf-8');
}

export async function getCurrentProfile(): Promise<string | undefined> {
  const config = await loadGlobalConfig();
  return config.current_profile;
}

export async function setCurrentProfile(profile: string): Promise<void> {
  const config = await loadGlobalConfig();
  config.current_profile = profile;
  await saveGlobalConfig(config);
}

export function getProfilesRoot(cwd: string = process.cwd()): string {
  return path.join(cwd, 'profiles');
}

export function getProfileDir(profile: string, cwd: string = process.cwd()): string {
  return path.join(getProfilesRoot(cwd), profile);
}

export async function profileExists(profile: string, cwd: string = process.cwd()): Promise<boolean> {
  const profileDir = getProfileDir(profile, cwd);
  const profileYaml = path.join(profileDir, 'profile.yaml');
  try {
    await fs.access(profileYaml);
    return true;
  } catch {
    return false;
  }
}

export async function loadProfile(profile: string, cwd: string = process.cwd()): Promise<ProfileConfig> {
  const profileDir = getProfileDir(profile, cwd);
  const profileYaml = path.join(profileDir, 'profile.yaml');
  
  try {
    const content = await fs.readFile(profileYaml, 'utf-8');
    const data = YAML.parse(content);
    return ProfileConfigSchema.parse(data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProfileNotFoundError(profile);
    }
    throw err;
  }
}

export async function listProfiles(cwd: string = process.cwd()): Promise<string[]> {
  const profilesRoot = getProfilesRoot(cwd);
  
  try {
    const entries = await fs.readdir(profilesRoot, { withFileTypes: true });
    const profiles: string[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const profileYaml = path.join(profilesRoot, entry.name, 'profile.yaml');
        try {
          await fs.access(profileYaml);
          profiles.push(entry.name);
        } catch {
          continue;
        }
      }
    }
    
    return profiles.sort();
  } catch {
    return [];
  }
}

export async function createProfile(
  profile: string,
  config: Partial<ProfileConfig> = {},
  cwd: string = process.cwd()
): Promise<void> {
  const profileDir = getProfileDir(profile, cwd);
  
  await fs.mkdir(profileDir, { recursive: true });
  await fs.mkdir(path.join(profileDir, 'posts'), { recursive: true });
  await fs.mkdir(path.join(profileDir, 'media'), { recursive: true });
  await fs.mkdir(path.join(profileDir, 'cache'), { recursive: true });
  
  const profileConfig: ProfileConfig = ProfileConfigSchema.parse({
    version: 1,
    profile,
    ...config,
  });
  
  const profileYaml = path.join(profileDir, 'profile.yaml');
  await fs.writeFile(profileYaml, YAML.stringify(profileConfig), 'utf-8');
}

export async function getResolvedProfile(
  explicitProfile?: string,
  cwd: string = process.cwd()
): Promise<{ name: string; config: ProfileConfig }> {
  const profileName = explicitProfile || await getCurrentProfile();
  
  if (!profileName) {
    throw new ProfileNotFoundError('No profile specified and no default profile set');
  }
  
  const config = await loadProfile(profileName, cwd);
  return { name: profileName, config };
}

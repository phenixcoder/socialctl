#!/usr/bin/env node
import { Command } from 'commander';
import { profileCommand } from './commands/profile.js';
import { postCommand } from './commands/post.js';
import { keyCommand } from './commands/key.js';
import { accountCommand } from './commands/account.js';
import { registerConnector } from '../connectors/base.js';
import { MetaInstagramConnector, MetaFacebookConnector } from '../connectors/meta/index.js';

registerConnector(new MetaInstagramConnector());
registerConnector(new MetaFacebookConnector());

const program = new Command();

program
  .name('socialctl')
  .description('CLI-first, GitOps-style social media control system')
  .version('0.2.0');

program.addCommand(profileCommand);
program.addCommand(postCommand);
program.addCommand(keyCommand);
program.addCommand(accountCommand);

program.parse();

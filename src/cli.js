#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import config from './config/index.js';

// Fancy banner
const banner = `
${chalk.cyan.bold('╔═══════════════════════════════════════╗')}
${chalk.cyan.bold('║')}  ${chalk.white.bold('🤖 TermAgent')} ${chalk.gray('- AI Coding Assistant')}  ${chalk.cyan.bold('║')}
${chalk.cyan.bold('╚═══════════════════════════════════════╝')}
`;

program
  .name('termagent')
  .description('AI Coding Agent for Termux')
  .version('1.0.0');

program
  .option('-p, --provider <provider>', 'AI provider (openai, anthropic, google, groq, zai)')
  .option('-m, --model <model>', 'Model to use')
  .option('-c, --continue', 'Continue last session')
  .option('--test', 'Test connection to provider')
  .option('--no-tui', 'Disable TUI, use simple output mode')
  .argument('[message]', 'Initial message to send')
  .action(async (message, options) => {
    if (options.provider) {
      try {
        config.setProvider(options.provider, options.model);
      } catch (e) {
        console.error(chalk.red(`Error: ${e.message}`));
        process.exit(1);
      }
    } else if (options.model) {
      config.set('model', options.model);
    }

    if (options.test) {
      await testConnection();
      return;
    }

    // Check for first run - show setup wizard
    if (config.isFirstRun() && process.stdin.isTTY) {
      await runFirstTimeSetup();
      return;
    }

    if (message) {
      await runSimpleMode(message, options.continue);
      return;
    }

    // No message - show session picker if TTY available
    if (process.stdin.isTTY) {
      await showSessionPicker();
      return;
    }

    // Non-TTY without message
    console.error(chalk.red('No message provided.'));
    console.error(chalk.gray('Usage: termagent "your message"'));
    process.exit(1);
  });

program
  .command('config')
  .description('Configure API keys and settings')
  .action(async () => {
    await configureKeys();
  });

program
  .command('providers')
  .description('List available providers and their status')
  .action(() => {
    listProviders();
  });

program
  .command('history')
  .description('Show conversation history and sessions')
  .action(async () => {
    await showHistory();
  });

program
  .command('new')
  .description('Start a fresh session (clear history)')
  .action(async () => {
    await startNewSession();
  });

program.parse();

/**
 * Simple mode with beautiful output
 */
async function runSimpleMode(message, continueSession = false) {
  const { createAgent } = await import('./agent/index.js');
  const { getLastSessionInfo, loadLastSession, autoSave } = await import('./conversation/index.js');

  const provider = config.getCurrentProvider();
  const model = config.getCurrentModel();
  const apiKey = config.getApiKey(provider);

  if (!apiKey) {
    console.error(chalk.red(`\n✗ No API key found for ${provider}.`));
    console.error(chalk.yellow(`  Set via: export ${provider.toUpperCase()}_API_KEY="your-key"`));
    process.exit(1);
  }

  if (!message) {
    console.error(chalk.red('No message provided.'));
    console.error(chalk.gray('Usage: termagent "your message"'));
    process.exit(1);
  }

  // Print header
  console.log(banner);
  console.log(chalk.gray(`Provider: ${chalk.cyan(provider)} | Model: ${chalk.green(model)}\n`));

  // Handle session continuation
  let sessionInfo = null;
  if (continueSession) {
    sessionInfo = await getLastSessionInfo();
    if (sessionInfo) {
      console.log(chalk.cyan.bold('┌─ Continuing Session ─────────────────────'));
      console.log(chalk.cyan('│ ') + chalk.gray('Started: ') + chalk.white(new Date(sessionInfo.startedAt).toLocaleString()));
      console.log(chalk.cyan('│ ') + chalk.gray('Messages: ') + chalk.white(`${sessionInfo.userMessageCount} user, ${sessionInfo.messageCount} total`));
      if (sessionInfo.lastUserMessage) {
        console.log(chalk.cyan('│ ') + chalk.gray('Last: ') + chalk.white(`"${sessionInfo.lastUserMessage}..."`));
      }
      console.log(chalk.cyan('└──────────────────────────────────────────\n'));
      
      await loadLastSession();
    } else {
      console.log(chalk.yellow('No previous session found. Starting new.\n'));
    }
  }
  
  // User message
  console.log(chalk.blue.bold('┌─ You ────────────────────────────────────'));
  console.log(chalk.blue('│ ') + message);
  console.log(chalk.blue('└──────────────────────────────────────────\n'));

  // Start spinner
  const spinner = ora({
    text: chalk.yellow('Thinking...'),
    spinner: 'dots',
    color: 'yellow',
  }).start();

  const agent = createAgent({
    onToolCall: (tc) => {
      spinner.stop();
      printToolCall(tc);
      spinner.start(chalk.yellow('Processing tool result...'));
    },
    onToolResult: (name, result) => {
      spinner.stop();
      printToolResult(name, result);
      spinner.start(chalk.yellow('Continuing...'));
    },
    onConfirmCommand: async (cmd, reason) => {
      spinner.stop();
      console.log(chalk.yellow.bold('\n⚠ Command requires confirmation:'));
      console.log(chalk.white(`  $ ${cmd}`));
      console.log(chalk.gray(`  Reason: ${reason}`));
      console.log(chalk.green('  [Auto-approved]\n'));
      spinner.start();
      return true;
    },
  });

  let hasContent = false;

  try {
    for await (const chunk of agent.chat(message)) {
      if (chunk.type === 'content') {
        if (!hasContent) {
          spinner.stop();
          console.log(chalk.green.bold('┌─ AI Response ────────────────────────────'));
          hasContent = true;
        }
        process.stdout.write(chunk.content);
      } else if (chunk.type === 'error') {
        spinner.fail(chalk.red(`Error: ${chunk.error}`));
        process.exit(1);
      } else if (chunk.type === 'done') {
        if (hasContent) {
          console.log('\n' + chalk.green('└──────────────────────────────────────────\n'));
        }
        spinner.stop();
        
        // Auto-save session
        await autoSave();
        console.log(chalk.gray('✓ Session saved\n'));
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Print tool call with details
 */
function printToolCall(toolCall) {
  const { name, arguments: args } = toolCall;
  
  console.log(chalk.magenta.bold(`\n┌─ Tool: ${name} ─────────────────────────`));
  
  // Format arguments based on tool type
  switch (name) {
    case 'read_file':
      console.log(chalk.magenta('│ ') + chalk.gray('Reading: ') + chalk.white(args.path));
      if (args.startLine) {
        console.log(chalk.magenta('│ ') + chalk.gray('Lines: ') + chalk.white(`${args.startLine}-${args.endLine || 'end'}`));
      }
      break;
      
    case 'write_file':
      console.log(chalk.magenta('│ ') + chalk.gray('Writing: ') + chalk.white(args.path));
      console.log(chalk.magenta('│ ') + chalk.gray('Content: ') + chalk.white(`${args.content?.length || 0} chars`));
      break;
      
    case 'edit_file':
      console.log(chalk.magenta('│ ') + chalk.gray('Editing: ') + chalk.white(args.path));
      console.log(chalk.magenta('│ ') + chalk.gray('Search: ') + chalk.yellow(`"${truncate(args.search, 40)}"`));
      console.log(chalk.magenta('│ ') + chalk.gray('Replace: ') + chalk.green(`"${truncate(args.replace, 40)}"`));
      break;
      
    case 'run_command':
      console.log(chalk.magenta('│ ') + chalk.gray('Command: ') + chalk.yellow(`$ ${args.command}`));
      if (args.cwd) {
        console.log(chalk.magenta('│ ') + chalk.gray('CWD: ') + chalk.white(args.cwd));
      }
      break;
      
    case 'list_directory':
      console.log(chalk.magenta('│ ') + chalk.gray('Path: ') + chalk.white(args.path || '.'));
      if (args.recursive) {
        console.log(chalk.magenta('│ ') + chalk.gray('Recursive: ') + chalk.white('yes'));
      }
      break;
      
    case 'find_files':
      console.log(chalk.magenta('│ ') + chalk.gray('Pattern: ') + chalk.white(args.pattern));
      if (args.cwd) {
        console.log(chalk.magenta('│ ') + chalk.gray('In: ') + chalk.white(args.cwd));
      }
      break;
      
    case 'grep_search':
      console.log(chalk.magenta('│ ') + chalk.gray('Pattern: ') + chalk.white(`"${args.pattern}"`));
      console.log(chalk.magenta('│ ') + chalk.gray('Path: ') + chalk.white(args.path || '.'));
      break;
      
    case 'find_definition':
      console.log(chalk.magenta('│ ') + chalk.gray('Symbol: ') + chalk.white(args.name));
      break;
      
    case 'git_status':
    case 'git_branch':
    case 'git_log':
      console.log(chalk.magenta('│ ') + chalk.gray('Git operation'));
      break;
      
    case 'git_diff':
      if (args.file) {
        console.log(chalk.magenta('│ ') + chalk.gray('File: ') + chalk.white(args.file));
      }
      break;
      
    default:
      // Show raw args for unknown tools
      const argStr = JSON.stringify(args, null, 2).split('\n').slice(0, 5).join('\n');
      console.log(chalk.magenta('│ ') + chalk.gray('Args: ') + chalk.white(argStr));
  }
  
  console.log(chalk.magenta('│ ') + chalk.yellow('⏳ Executing...'));
}

/**
 * Print tool result
 */
function printToolResult(name, result) {
  if (result.error) {
    console.log(chalk.magenta('│ ') + chalk.red(`✗ Error: ${result.error}`));
  } else {
    console.log(chalk.magenta('│ ') + chalk.green('✓ Success'));
    
    // Show relevant result info
    if (result.message) {
      console.log(chalk.magenta('│ ') + chalk.gray(result.message));
    }
    if (result.stdout && result.stdout.length < 200) {
      console.log(chalk.magenta('│ ') + chalk.gray('Output: ') + chalk.white(truncate(result.stdout, 100)));
    }
    if (result.entries && Array.isArray(result.entries)) {
      const count = result.entries.length;
      console.log(chalk.magenta('│ ') + chalk.gray(`Found ${count} items`));
    }
    if (result.results && Array.isArray(result.results)) {
      console.log(chalk.magenta('│ ') + chalk.gray(`Found ${result.results.length} matches`));
    }
    if (result.diff) {
      console.log(chalk.magenta('│ ') + chalk.gray('Diff:'));
      result.diff.split('\n').slice(0, 5).forEach(line => {
        if (line.startsWith('+')) {
          console.log(chalk.magenta('│   ') + chalk.green(line));
        } else if (line.startsWith('-')) {
          console.log(chalk.magenta('│   ') + chalk.red(line));
        } else {
          console.log(chalk.magenta('│   ') + chalk.gray(line));
        }
      });
    }
  }
  
  console.log(chalk.magenta('└──────────────────────────────────────────\n'));
}

/**
 * Truncate string
 */
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

async function startApp(initialMessage) {
  try {
    if (!process.stdin.isTTY) {
      console.log(chalk.yellow('Interactive mode requires TTY. Use: termagent "message"'));
      process.exit(1);
    }

    const { render } = await import('ink');
    const React = await import('react');
    const { App } = await import('./ui/App.js');

    const provider = config.getCurrentProvider();
    const apiKey = config.getApiKey(provider);

    if (!apiKey) {
      console.error(chalk.red(`\n✗ No API key found for ${provider}.`));
      console.error(chalk.yellow(`Set via: export ${provider.toUpperCase()}_API_KEY="your-key"`));
      process.exit(1);
    }

    render(React.createElement(App, { initialMessage }));
  } catch (error) {
    console.error(chalk.red('Failed to start:'), error.message);
    process.exit(1);
  }
}

async function testConnection() {
  const { getProvider } = await import('./providers/index.js');
  const provider = config.getCurrentProvider();
  const model = config.getCurrentModel();

  console.log(banner);
  
  const spinner = ora({
    text: `Testing connection to ${chalk.cyan(provider)}...`,
    spinner: 'dots',
  }).start();

  try {
    const prov = getProvider();
    const success = await prov.testConnection();

    if (success) {
      spinner.succeed(chalk.green('Connection successful!'));
      console.log(chalk.gray(`  Provider: ${chalk.cyan(provider)}`));
      console.log(chalk.gray(`  Model: ${chalk.green(model)}`));
    } else {
      spinner.fail(chalk.red('Connection failed'));
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

async function configureKeys() {
  const readline = await import('readline');

  console.log(banner);
  console.log(chalk.cyan.bold('Configuration Wizard\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => {
      rl.question(prompt, resolve);
    });

  console.log(chalk.gray('Enter API keys (leave blank to skip):\n'));

  const providers = ['openai', 'anthropic', 'google', 'groq', 'zai'];

  for (const provider of providers) {
    const current = config.getApiKey(provider);
    const masked = current ? chalk.green(current.slice(0, 8) + '...') : chalk.gray('(not set)');
    const key = await question(`${chalk.white(provider)} [${masked}]: `);

    if (key.trim()) {
      config.setApiKey(provider, key.trim());
      console.log(chalk.green(`  ✓ ${provider} key saved\n`));
    }
  }

  const defaultProvider = await question(chalk.white('\nDefault provider [openai]: '));
  if (defaultProvider.trim()) {
    try {
      config.setProvider(defaultProvider.trim());
      console.log(chalk.green(`  ✓ Default provider: ${defaultProvider.trim()}`));
    } catch (e) {
      console.error(chalk.red(`  ✗ Invalid provider: ${defaultProvider}`));
    }
  }

  rl.close();
  console.log(chalk.green.bold('\n✓ Configuration saved!\n'));
}

function listProviders() {
  console.log(banner);
  console.log(chalk.cyan.bold('Available Providers\n'));

  const providers = config.getProviders();
  const current = config.getCurrentProvider();
  const currentModel = config.getCurrentModel();

  for (const provider of providers) {
    const hasKey = !!config.getApiKey(provider);
    const isCurrent = provider === current;
    const models = config.getModels(provider);

    const status = hasKey ? chalk.green('✓') : chalk.red('✗');
    const name = isCurrent ? chalk.cyan.bold(provider) : chalk.white(provider);
    const tag = isCurrent ? chalk.cyan(' (current)') : '';

    console.log(`${status} ${name}${tag}`);
    console.log(chalk.gray(`  Models: ${models.join(', ')}\n`));
  }

  console.log(chalk.gray(`Current model: ${chalk.green(currentModel)}\n`));
}

async function showHistory() {
  const { listSessions, getLastSessionInfo } = await import('./conversation/index.js');

  console.log(banner);
  console.log(chalk.cyan.bold('Session History\n'));

  // Current session info
  const current = await getLastSessionInfo();
  if (current) {
    console.log(chalk.green.bold('Current Session:'));
    console.log(chalk.gray(`  Started: ${new Date(current.startedAt).toLocaleString()}`));
    console.log(chalk.gray(`  Updated: ${new Date(current.lastUpdated).toLocaleString()}`));
    console.log(chalk.gray(`  Messages: ${current.messageCount} (${current.userMessageCount} from you)`));
    if (current.lastUserMessage) {
      console.log(chalk.gray(`  Last: "${current.lastUserMessage}..."`));
    }
    console.log(chalk.gray(`  Dir: ${current.workingDirectory}\n`));
  } else {
    console.log(chalk.yellow('No current session.\n'));
  }

  // All sessions
  const sessions = await listSessions();
  if (sessions.length > 0) {
    console.log(chalk.cyan.bold('Saved Sessions:'));
    sessions.forEach((session, i) => {
      const date = new Date(session.lastUpdated).toLocaleString();
      const preview = session.preview ? `"${session.preview}..."` : '(empty)';
      console.log(chalk.white(`  ${i + 1}. ${date}`));
      console.log(chalk.gray(`     ${session.userMessageCount} msgs · ${preview}`));
    });
    console.log();
  }

  console.log(chalk.gray('Use -c/--continue to continue last session:'));
  console.log(chalk.white('  termagent -c "your message"\n'));
}

async function startNewSession() {
  const { newConversation } = await import('./conversation/index.js');

  console.log(banner);
  
  newConversation();
  
  console.log(chalk.green.bold('✓ New session started\n'));
  console.log(chalk.gray('Previous session cleared. Ready for new conversation.\n'));
  console.log(chalk.white('Usage: termagent "your message"\n'));
}

async function showSessionPicker() {
  const readline = await import('readline');
  const { listSessions, loadSession, newConversation, getLastSessionInfo } = await import('./conversation/index.js');

  console.log(banner);
  console.log(chalk.cyan.bold('Session Manager\n'));

  // Get sessions
  const sessions = await listSessions();
  const currentSession = await getLastSessionInfo();

  // Build menu
  const options = [];
  
  // Option 0: New session
  options.push({
    label: 'New Session',
    description: `Start fresh in ${process.cwd()}`,
    action: 'new',
  });

  // Option 1: Continue current (if exists)
  if (currentSession) {
    options.push({
      label: 'Continue Last Session',
      description: `${currentSession.userMessageCount} msgs · "${currentSession.lastUserMessage?.slice(0, 30) || 'empty'}..."`,
      workingDir: currentSession.workingDirectory,
      action: 'continue',
    });
  }

  // Other sessions
  for (const session of sessions.slice(0, 5)) {
    // Skip if same as current
    if (currentSession && session.sessionId === currentSession.sessionId) continue;
    
    options.push({
      label: new Date(session.lastUpdated).toLocaleString(),
      description: `${session.userMessageCount} msgs · "${session.preview?.slice(0, 25) || 'empty'}..."`,
      filename: session.filename,
      workingDir: session.workingDirectory,
      action: 'load',
    });
  }

  // Display menu
  console.log(chalk.gray('Select a session:\n'));
  
  options.forEach((opt, i) => {
    const num = chalk.cyan.bold(`  [${i}]`);
    const label = i === 0 ? chalk.green.bold(opt.label) : 
                  i === 1 && currentSession ? chalk.yellow.bold(opt.label) : 
                  chalk.white(opt.label);
    console.log(`${num} ${label}`);
    console.log(chalk.gray(`      ${opt.description}`));
    if (opt.workingDir && opt.workingDir !== process.cwd()) {
      console.log(chalk.gray(`      📁 ${opt.workingDir}`));
    }
    console.log();
  });

  // Get user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => {
      rl.question(prompt, resolve);
    });

  const choice = await question(chalk.cyan('Enter number (or q to quit): '));
  rl.close();

  if (choice.toLowerCase() === 'q') {
    console.log(chalk.gray('\nGoodbye!\n'));
    process.exit(0);
  }

  const index = parseInt(choice, 10);
  if (isNaN(index) || index < 0 || index >= options.length) {
    console.log(chalk.red('\nInvalid choice.\n'));
    process.exit(1);
  }

  const selected = options[index];

  // Handle selection
  if (selected.action === 'new') {
    newConversation();
    console.log(chalk.green.bold('\n✓ New session started'));
    console.log(chalk.gray(`Working directory: ${process.cwd()}\n`));
  } else if (selected.action === 'continue') {
    // Already loaded as current session
    console.log(chalk.green.bold('\n✓ Continuing last session'));
  } else if (selected.action === 'load') {
    await loadSession(selected.filename);
    console.log(chalk.green.bold('\n✓ Session loaded'));
  }

  // Change to session's working directory if different
  if (selected.workingDir && selected.workingDir !== process.cwd()) {
    try {
      process.chdir(selected.workingDir);
      console.log(chalk.cyan(`📁 Changed to: ${selected.workingDir}`));
    } catch (e) {
      console.log(chalk.yellow(`⚠ Could not change to: ${selected.workingDir}`));
    }
  }

  console.log(chalk.gray('\nReady! Use termagent with your message:\n'));
  console.log(chalk.white('  termagent "your message"'));
  console.log(chalk.white('  termagent -c "continue conversation"\n'));
}

/**
 * First-time setup wizard
 */
async function runFirstTimeSetup() {
  const readline = await import('readline');

  const welcomeBanner = `
${chalk.cyan.bold('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan.bold('║')}                                                           ${chalk.cyan.bold('║')}
${chalk.cyan.bold('║')}   ${chalk.white.bold('🤖 Welcome to TermAgent!')}                              ${chalk.cyan.bold('║')}
${chalk.cyan.bold('║')}   ${chalk.gray('AI Coding Assistant for Termux')}                       ${chalk.cyan.bold('║')}
${chalk.cyan.bold('║')}                                                           ${chalk.cyan.bold('║')}
${chalk.cyan.bold('╚═══════════════════════════════════════════════════════════╝')}
`;

  console.log(welcomeBanner);
  
  console.log(chalk.cyan.bold('First-Time Setup\n'));
  console.log(chalk.gray('Let\'s configure your AI provider. You\'ll need at least one API key.\n'));
  
  console.log(chalk.white.bold('Available Providers:'));
  console.log(chalk.gray('  • OpenAI     - GPT-4, GPT-4o (https://platform.openai.com)'));
  console.log(chalk.gray('  • Anthropic  - Claude 3.5 (https://console.anthropic.com)'));
  console.log(chalk.gray('  • Google     - Gemini (https://aistudio.google.com)'));
  console.log(chalk.gray('  • Groq       - Llama 3.3 (https://console.groq.com) - Free tier!'));
  console.log(chalk.gray('  • Z.AI       - GLM-4.7 (https://z.ai) - Free tier!\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => {
      rl.question(prompt, resolve);
    });

  // Provider selection
  console.log(chalk.cyan.bold('Step 1: Choose your provider\n'));
  const providers = ['openai', 'anthropic', 'google', 'groq', 'zai'];
  
  providers.forEach((p, i) => {
    const recommended = p === 'groq' || p === 'zai' ? chalk.green(' (free tier)') : '';
    console.log(chalk.white(`  [${i + 1}] ${p}${recommended}`));
  });
  
  let selectedProvider = null;
  while (!selectedProvider) {
    const choice = await question(chalk.cyan('\nSelect provider [1-5]: '));
    const index = parseInt(choice, 10) - 1;
    if (index >= 0 && index < providers.length) {
      selectedProvider = providers[index];
    } else {
      console.log(chalk.red('Invalid choice. Please enter 1-5.'));
    }
  }
  
  console.log(chalk.green(`\n✓ Selected: ${selectedProvider}\n`));

  // API key input
  console.log(chalk.cyan.bold('Step 2: Enter your API key\n'));
  
  const keyHints = {
    openai: 'Starts with sk-...',
    anthropic: 'Starts with sk-ant-...',
    google: 'Your Google AI API key',
    groq: 'Starts with gsk_...',
    zai: 'Your Z.AI API key',
  };
  
  console.log(chalk.gray(`Hint: ${keyHints[selectedProvider]}\n`));
  
  let apiKey = null;
  while (!apiKey) {
    const key = await question(chalk.cyan('API Key: '));
    if (key.trim().length > 10) {
      apiKey = key.trim();
    } else {
      console.log(chalk.red('API key seems too short. Please enter a valid key.'));
    }
  }

  // Save configuration
  config.setApiKey(selectedProvider, apiKey);
  config.setProvider(selectedProvider);
  console.log(chalk.green('\n✓ API key saved securely'));

  // Test connection
  console.log(chalk.cyan.bold('\nStep 3: Testing connection...\n'));
  
  const spinner = ora({
    text: `Connecting to ${selectedProvider}...`,
    spinner: 'dots',
  }).start();

  try {
    const { getProvider } = await import('./providers/index.js');
    const provider = getProvider();
    const success = await provider.testConnection();

    if (success) {
      spinner.succeed(chalk.green('Connection successful!'));
      console.log(chalk.gray(`  Model: ${config.getCurrentModel()}`));
    } else {
      spinner.fail(chalk.red('Connection failed. Please check your API key.'));
      console.log(chalk.yellow('\nYou can reconfigure later with: termagent config'));
      rl.close();
      return;
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${error.message}`));
    console.log(chalk.yellow('\nYou can reconfigure later with: termagent config'));
    rl.close();
    return;
  }

  // Mark setup complete
  config.markSetupComplete();

  // Completion message
  console.log(chalk.green.bold('\n✅ Setup Complete!\n'));
  
  console.log(chalk.white.bold('Quick Start:'));
  console.log(chalk.gray('  termagent "Create a hello world script"'));
  console.log(chalk.gray('  termagent "List files in current directory"'));
  console.log(chalk.gray('  termagent "Help me debug this code"\n'));
  
  console.log(chalk.white.bold('Useful Commands:'));
  console.log(chalk.gray('  termagent              - Session picker'));
  console.log(chalk.gray('  termagent -c "msg"     - Continue last session'));
  console.log(chalk.gray('  termagent providers    - List all providers'));
  console.log(chalk.gray('  termagent config       - Reconfigure API keys\n'));

  // Ask if want to start now
  const startNow = await question(chalk.cyan('Start a session now? (y/n): '));
  rl.close();

  if (startNow.toLowerCase() === 'y') {
    console.log();
    await showSessionPicker();
  } else {
    console.log(chalk.gray('\nRun termagent anytime to start. Happy coding! 🚀\n'));
  }
}

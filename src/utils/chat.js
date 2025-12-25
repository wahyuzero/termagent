import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { createAgent } from '../agent/index.js';
import config from '../config/index.js';
import { getUndoManager } from './undo.js';
import { getProjectInfo, buildContextSummary } from './context.js';
import { getConversation, autoSave, loadLastSession, newConversation } from '../conversation/index.js';
import { getAllTools, executeTool } from '../tools/index.js';

/**
 * Interactive Chat REPL
 */
export class ChatRepl {
  constructor(options = {}) {
    this.options = options;
    this.running = false;
    this.agent = null;
    this.rl = null;
    this.spinner = null;
    this.tokenUsage = { prompt: 0, completion: 0 };
  }

  /**
   * Start the REPL
   */
  async start() {
    this.running = true;
    
    // Print welcome
    this.printWelcome();
    
    // Load or create session
    if (this.options.continue) {
      await loadLastSession();
      console.log(chalk.cyan('Continuing last session...\n'));
    } else {
      newConversation();
    }

    // Setup agent
    this.agent = createAgent({
      onToolCall: (tc) => this.handleToolCall(tc),
      onToolResult: (name, result) => this.handleToolResult(name, result),
      onConfirmCommand: (cmd, reason) => this.confirmCommand(cmd, reason),
    });

    // Setup readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('> '),
    });

    // Handle input
    this.rl.on('line', async (line) => {
      await this.handleInput(line.trim());
      if (this.running) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.exit();
    });

    // Ctrl+C handling
    process.on('SIGINT', () => {
      if (this.spinner) {
        this.spinner.stop();
      }
      console.log(chalk.gray('\n\nUse /exit to quit.\n'));
      this.rl.prompt();
    });

    // Start prompting
    this.rl.prompt();
  }

  /**
   * Print welcome message
   */
  printWelcome() {
    console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║') + chalk.white.bold('  🤖 TermAgent Interactive Mode       ') + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('╚═══════════════════════════════════════╝\n'));
    
    console.log(chalk.gray(`Provider: ${chalk.cyan(config.getCurrentProvider())} | Model: ${chalk.green(config.getCurrentModel())}`));
    console.log(chalk.gray('Type /help for commands, /exit to quit\n'));
  }

  /**
   * Handle user input
   */
  async handleInput(input) {
    if (!input) return;

    // Check for slash commands
    if (input.startsWith('/')) {
      await this.handleSlashCommand(input);
      return;
    }

    // Regular message - send to AI
    await this.sendMessage(input);
  }

  /**
   * Handle slash commands
   */
  async handleSlashCommand(input) {
    const [cmd, ...args] = input.slice(1).split(' ');
    const arg = args.join(' ');

    switch (cmd.toLowerCase()) {
      case 'exit':
      case 'quit':
      case 'q':
        this.exit();
        break;

      case 'help':
      case 'h':
      case '?':
        this.showHelp();
        break;

      case 'clear':
        newConversation();
        console.log(chalk.green('✓ Conversation cleared\n'));
        break;

      case 'files':
      case 'ls':
        await this.listFiles(arg);
        break;

      case 'read':
      case 'cat':
        await this.readFile(arg);
        break;

      case 'run':
      case 'exec':
        await this.runCommand(arg);
        break;

      case 'undo':
        await this.undoLastChange();
        break;

      case 'diff':
      case 'changes':
        await this.showRecentChanges();
        break;

      case 'context':
      case 'project':
        await this.showProjectContext();
        break;

      case 'save':
        await autoSave();
        console.log(chalk.green('✓ Session saved\n'));
        break;

      case 'tokens':
      case 'usage':
        this.showTokenUsage();
        break;

      case 'provider':
        if (arg) {
          try {
            config.setProvider(arg);
            console.log(chalk.green(`✓ Switched to ${arg}\n`));
          } catch (e) {
            console.log(chalk.red(`Error: ${e.message}\n`));
          }
        } else {
          console.log(chalk.gray(`Current: ${config.getCurrentProvider()}/${config.getCurrentModel()}\n`));
        }
        break;

      default:
        console.log(chalk.yellow(`Unknown command: /${cmd}`));
        console.log(chalk.gray('Type /help for available commands\n'));
    }
  }

  /**
   * Send message to AI
   */
  async sendMessage(message) {
    this.spinner = ora({
      text: chalk.yellow('Thinking...'),
      spinner: 'dots',
    }).start();

    let response = '';

    try {
      for await (const chunk of this.agent.chat(message)) {
        if (chunk.type === 'content') {
          if (this.spinner.isSpinning) {
            this.spinner.stop();
            console.log(chalk.green.bold('\nAI:'));
          }
          process.stdout.write(chunk.content);
          response += chunk.content;
        } else if (chunk.type === 'usage') {
          this.tokenUsage.prompt += chunk.promptTokens || 0;
          this.tokenUsage.completion += chunk.completionTokens || 0;
        } else if (chunk.type === 'error') {
          this.spinner.fail(chalk.red(chunk.error));
        } else if (chunk.type === 'done') {
          if (this.spinner.isSpinning) {
            this.spinner.stop();
          }
          console.log('\n');
          
          // Show suggestions
          this.showSuggestions(message, response);
          
          // Auto-save
          await autoSave();
        }
      }
    } catch (error) {
      this.spinner.fail(chalk.red(`Error: ${error.message}`));
    }
  }

  /**
   * Handle tool call display
   */
  handleToolCall(tc) {
    if (this.spinner) this.spinner.stop();
    
    const { name, arguments: args } = tc;
    console.log(chalk.magenta(`\n[Tool: ${name}]`));
    
    // Show relevant args
    if (args.path) console.log(chalk.gray(`  Path: ${args.path}`));
    if (args.command) console.log(chalk.gray(`  Cmd: ${args.command}`));
    if (args.pattern) console.log(chalk.gray(`  Pattern: ${args.pattern}`));
    
    this.spinner = ora({
      text: chalk.yellow('Executing...'),
      spinner: 'dots',
    }).start();
  }

  /**
   * Handle tool result display
   */
  handleToolResult(name, result) {
    if (this.spinner) this.spinner.stop();
    
    if (result.error) {
      console.log(chalk.red(`  ✗ ${result.error}`));
    } else {
      console.log(chalk.green(`  ✓ Success`));
    }
  }

  /**
   * Confirm dangerous command
   */
  async confirmCommand(cmd, reason) {
    if (this.spinner) this.spinner.stop();
    
    console.log(chalk.yellow.bold('\n⚠ Command requires confirmation:'));
    console.log(chalk.white(`  $ ${cmd}`));
    console.log(chalk.gray(`  Reason: ${reason}`));
    
    return new Promise((resolve) => {
      this.rl.question(chalk.cyan('  Allow? (y/n): '), (answer) => {
        const allowed = answer.toLowerCase() === 'y';
        console.log(allowed ? chalk.green('  Allowed\n') : chalk.red('  Denied\n'));
        resolve(allowed);
      });
    });
  }

  /**
   * Show smart suggestions
   */
  showSuggestions(userMessage, aiResponse) {
    const suggestions = [];
    
    // Detect what kind of response
    if (aiResponse.includes('created') || aiResponse.includes('wrote')) {
      suggestions.push('Run the script');
      suggestions.push('Add error handling');
    }
    if (aiResponse.includes('error') || aiResponse.includes('fix')) {
      suggestions.push('Show the full error');
      suggestions.push('Try a different approach');
    }
    if (aiResponse.includes('.py') || aiResponse.includes('python')) {
      suggestions.push('Add tests');
      suggestions.push('Add type hints');
    }
    if (aiResponse.includes('.js') || aiResponse.includes('node')) {
      suggestions.push('Add tests');
      suggestions.push('Add TypeScript');
    }
    
    if (suggestions.length > 0) {
      console.log(chalk.gray('Suggestions:'));
      suggestions.slice(0, 3).forEach((s, i) => {
        console.log(chalk.gray(`  [${i + 1}] ${s}`));
      });
      console.log();
    }
  }

  /**
   * Show help
   */
  showHelp() {
    console.log(chalk.cyan.bold('\nChat Commands:\n'));
    console.log(chalk.white('  /help, /h       ') + chalk.gray('Show this help'));
    console.log(chalk.white('  /exit, /q       ') + chalk.gray('Exit chat'));
    console.log(chalk.white('  /clear          ') + chalk.gray('Clear conversation'));
    console.log(chalk.white('  /save           ') + chalk.gray('Save session'));
    console.log();
    console.log(chalk.cyan.bold('Quick Actions:\n'));
    console.log(chalk.white('  /files [path]   ') + chalk.gray('List files'));
    console.log(chalk.white('  /read <file>    ') + chalk.gray('Read file contents'));
    console.log(chalk.white('  /run <cmd>      ') + chalk.gray('Run shell command'));
    console.log(chalk.white('  /undo           ') + chalk.gray('Undo last file change'));
    console.log(chalk.white('  /diff           ') + chalk.gray('Show recent changes'));
    console.log();
    console.log(chalk.cyan.bold('Info:\n'));
    console.log(chalk.white('  /context        ') + chalk.gray('Show project context'));
    console.log(chalk.white('  /tokens         ') + chalk.gray('Show token usage'));
    console.log(chalk.white('  /provider [p]   ') + chalk.gray('Show/set provider'));
    console.log();
  }

  /**
   * List files
   */
  async listFiles(path) {
    const result = await executeTool('list_directory', { path: path || '.' });
    if (result.error) {
      console.log(chalk.red(`Error: ${result.error}\n`));
    } else {
      console.log(chalk.cyan('\nFiles:\n'));
      for (const entry of result.entries || []) {
        const icon = entry.type === 'directory' ? '📁' : '📄';
        console.log(`  ${icon} ${entry.name}`);
      }
      console.log();
    }
  }

  /**
   * Read file
   */
  async readFile(path) {
    if (!path) {
      console.log(chalk.red('Usage: /read <filename>\n'));
      return;
    }
    
    const result = await executeTool('read_file', { path });
    if (result.error) {
      console.log(chalk.red(`Error: ${result.error}\n`));
    } else {
      console.log(chalk.cyan(`\n─── ${path} ───\n`));
      console.log(result.content);
      console.log(chalk.cyan('\n──────────────────\n'));
    }
  }

  /**
   * Run command
   */
  async runCommand(cmd) {
    if (!cmd) {
      console.log(chalk.red('Usage: /run <command>\n'));
      return;
    }
    
    console.log(chalk.gray(`\n$ ${cmd}\n`));
    const result = await executeTool('run_command', { command: cmd });
    
    if (result.error) {
      console.log(chalk.red(`Error: ${result.error}\n`));
    } else {
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.log(chalk.yellow(result.stderr));
      console.log();
    }
  }

  /**
   * Undo last change
   */
  async undoLastChange() {
    const undo = getUndoManager();
    const result = await undo.undo();
    
    if (result.success) {
      console.log(chalk.green(`✓ ${result.message}\n`));
    } else {
      console.log(chalk.yellow(`${result.error}\n`));
    }
  }

  /**
   * Show recent changes
   */
  async showRecentChanges() {
    const undo = getUndoManager();
    const changes = await undo.getRecentChanges(5);
    
    if (changes.length === 0) {
      console.log(chalk.gray('No recent changes\n'));
      return;
    }
    
    console.log(chalk.cyan.bold('\nRecent Changes:\n'));
    changes.forEach((c, i) => {
      const time = new Date(c.time).toLocaleTimeString();
      console.log(chalk.gray(`  ${i + 1}. [${time}] ${c.operation}: ${c.file}`));
    });
    console.log();
  }

  /**
   * Show project context
   */
  async showProjectContext() {
    const info = await getProjectInfo();
    
    console.log(chalk.cyan.bold('\nProject Context:\n'));
    console.log(chalk.gray(`  Type: ${info.type}`));
    console.log(chalk.gray(`  Dir: ${info.directory}`));
    
    if (info.files.length > 0) {
      console.log(chalk.gray('\n  Key files:'));
      info.files.forEach(f => {
        console.log(chalk.gray(`    - ${f.name} (${f.size} bytes)`));
      });
    }
    console.log();
  }

  /**
   * Show token usage
   */
  showTokenUsage() {
    const total = this.tokenUsage.prompt + this.tokenUsage.completion;
    
    // Rough cost estimate (GPT-4 pricing as baseline)
    const cost = (this.tokenUsage.prompt * 0.00003) + (this.tokenUsage.completion * 0.00006);
    
    console.log(chalk.cyan.bold('\nToken Usage:\n'));
    console.log(chalk.gray(`  Prompt: ${this.tokenUsage.prompt.toLocaleString()}`));
    console.log(chalk.gray(`  Completion: ${this.tokenUsage.completion.toLocaleString()}`));
    console.log(chalk.gray(`  Total: ${total.toLocaleString()}`));
    console.log(chalk.gray(`  Est. Cost: $${cost.toFixed(4)}`));
    console.log();
  }

  /**
   * Exit the REPL
   */
  async exit() {
    this.running = false;
    
    // Save session
    await autoSave();
    
    console.log(chalk.gray('\n✓ Session saved. Goodbye! 👋\n'));
    process.exit(0);
  }
}

export default { ChatRepl };

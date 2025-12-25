import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { createAgent } from '../agent/index.js';
import config from '../config/index.js';
import { getUndoManager } from './undo.js';
import { getProjectInfo } from './context.js';
import { autoSave, loadLastSession, newConversation } from '../conversation/index.js';
import { executeTool } from '../tools/index.js';

// Modern icons for display
const ICONS = {
  thinking: '⛬',
  success: '✓',
  error: '✗',
  warning: '⚠',
  arrow: '↳',
  circle: '○',
  bullet: '•',
  folder: '📁',
  file: '📄',
  edit: '✎',
  run: '▶',
  search: '🔍',
  git: '⎇',
};

/**
 * Interactive Chat REPL with Modern UI
 */
export class ChatRepl {
  constructor(options = {}) {
    this.options = options;
    this.running = false;
    this.processing = false;
    this.agent = null;
    this.rl = null;
    this.spinner = null;
    this.tokenUsage = { prompt: 0, completion: 0 };
    this.pendingTasks = [];
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

    // Ensure stdin stays open
    process.stdin.resume();
    
    // Keep the event loop alive while running
    this.keepAliveInterval = setInterval(() => {
      // Just keep alive, do nothing
    }, 1000);

    // Run with event-based approach 
    return new Promise((resolve) => {
      this.exitResolve = resolve;
      this.promptNext();
    });
  }

  /**
   * Show prompt and handle next input
   * Creates a fresh readline for each prompt to avoid state issues
   */
  promptNext() {
    if (!this.running) {
      this.cleanup();
      return;
    }
    
    // Create fresh readline for this prompt
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY,
    });
    
    rl.question(chalk.green('> '), async (answer) => {
      // Close this readline immediately after getting input
      rl.close();
      
      if (!this.running) {
        this.cleanup();
        return;
      }
      
      const input = (answer || '').trim();
      
      if (!input) {
        setImmediate(() => this.promptNext());
        return;
      }
      
      try {
        await this.handleInput(input);
      } catch (error) {
        console.log(chalk.red(`Error: ${error.message}\n`));
      }
      
      // Schedule next prompt
      setImmediate(() => this.promptNext());
    });

    // Handle Ctrl+C on this readline
    rl.on('SIGINT', () => {
      console.log(chalk.gray('\nUse /exit to quit.\n'));
      rl.close();
      setImmediate(() => this.promptNext());
    });
  }

  /**
   * Cleanup and exit
   */
  cleanup() {
    // Clear keepalive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    
    // No persistent readline to close - we use fresh ones per prompt
    
    this.exit().then(() => {
      if (this.exitResolve) {
        this.exitResolve();
      }
    });
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
        this.running = false;
        break;

      case 'help':
      case 'h':
      case '?':
        this.showHelp();
        break;

      case 'clear':
        newConversation();
        console.log(chalk.green(`${ICONS.success} Conversation cleared\n`));
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
        console.log(chalk.green(`${ICONS.success} Session saved\n`));
        break;

      case 'tokens':
      case 'usage':
        this.showTokenUsage();
        break;

      case 'provider':
        if (arg) {
          try {
            config.setProvider(arg);
            console.log(chalk.green(`${ICONS.success} Switched to ${arg}\n`));
          } catch (e) {
            console.log(chalk.red(`${ICONS.error} ${e.message}\n`));
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
   * Send message to AI with modern display
   */
  async sendMessage(message) {
    this.processing = true;
    this.pendingTasks = [];
    
    // Simple thinking indicator (no ora spinner - it breaks readline)
    console.log(chalk.cyan('\n⛬  ') + chalk.gray('Thinking...\n'));
    this.spinner = null;

    let response = '';
    let hasContent = false;

    try {
      for await (const chunk of this.agent.chat(message)) {
        if (chunk.type === 'content') {
          if (this.spinner && this.spinner.isSpinning) {
            this.spinner.stop();
          }
          if (!hasContent) {
            console.log(chalk.cyan(ICONS.thinking) + '  ' + chalk.gray('Response:\n'));
            hasContent = true;
          }
          process.stdout.write(chalk.white(chunk.content));
          response += chunk.content;
        } else if (chunk.type === 'usage') {
          this.tokenUsage.prompt += chunk.promptTokens || 0;
          this.tokenUsage.completion += chunk.completionTokens || 0;
        } else if (chunk.type === 'error') {
          if (this.spinner) this.spinner.stop();
          console.log(chalk.red(`\n${ICONS.error} Error: ${chunk.error}\n`));
        } else if (chunk.type === 'done') {
          if (this.spinner && this.spinner.isSpinning) {
            this.spinner.stop();
          }
          if (hasContent) {
            console.log('\n');
          }
          
          // Show pending tasks if any
          if (this.pendingTasks.length > 0) {
            this.showPendingTasks();
          }
          
          // Auto-save
          await autoSave();
        }
      }
    } catch (error) {
      if (this.spinner) this.spinner.stop();
      console.log(chalk.red(`\n${ICONS.error} Error: ${error.message}\n`));
    }
    
    // Force flush stdout before returning
    if (process.stdout.write) {
      process.stdout.write('');
    }
    
    this.processing = false;
  }

  /**
   * Handle tool call with modern display
   */
  handleToolCall(tc) {
    if (this.spinner && this.spinner.isSpinning) {
      this.spinner.stop();
    }
    
    const { name, arguments: args } = tc;
    
    // Format tool name nicely
    const toolDisplay = this.formatToolName(name, args);
    
    console.log(chalk.cyan(`\n   ${toolDisplay.icon}  ${toolDisplay.label}`));
    
    this.spinner = ora({
      text: '',
      spinner: 'dots',
      prefixText: chalk.gray('   '),
    }).start();
  }

  /**
   * Format tool name for display
   */
  formatToolName(name, args) {
    switch (name) {
      case 'read_file':
        const readPath = args.path?.split('/').pop() || args.path;
        return { icon: 'READ', label: chalk.gray(`(${readPath})`) };
      case 'write_file':
        const writePath = args.path?.split('/').pop() || args.path;
        return { icon: 'WRITE', label: chalk.gray(`(${writePath})`) };
      case 'edit_file':
        const editPath = args.path?.split('/').pop() || args.path;
        return { icon: 'EDIT', label: chalk.gray(`(${editPath})`) };
      case 'list_directory':
        const dirPath = args.path || 'current directory';
        return { icon: 'LIST DIRECTORY', label: chalk.gray(`(${dirPath})`) };
      case 'run_command':
        const cmd = args.command?.slice(0, 30) || '';
        return { icon: 'RUN', label: chalk.gray(`(${cmd}${args.command?.length > 30 ? '...' : ''})`) };
      case 'grep_search':
        return { icon: 'SEARCH', label: chalk.gray(`(${args.pattern})`) };
      case 'find_files':
        return { icon: 'FIND', label: chalk.gray(`(${args.pattern})`) };
      case 'delete_file':
        return { icon: 'DELETE', label: chalk.gray(`(${args.path})`) };
      case 'git_status':
      case 'git_diff':
      case 'git_log':
        return { icon: 'GIT', label: chalk.gray(`(${name.replace('git_', '')})`) };
      default:
        return { icon: name.toUpperCase(), label: '' };
    }
  }

  /**
   * Handle tool result with modern display
   */
  handleToolResult(name, result) {
    if (this.spinner) this.spinner.stop();
    
    if (result.error) {
      console.log(chalk.red(`   ${ICONS.arrow} ${ICONS.error} ${result.error}`));
    } else {
      // Format result message
      let msg = 'Success';
      if (result.totalLines) msg = `Read ${result.totalLines} lines.`;
      else if (result.entries?.length) msg = `Listed ${result.entries.length} items.`;
      else if (result.message) msg = result.message;
      else if (result.files?.length) msg = `Found ${result.files.length} files.`;
      
      console.log(chalk.gray(`   ${ICONS.arrow} ${msg}`));
    }
  }

  /**
   * Confirm dangerous command
   */
  async confirmCommand(cmd, reason) {
    if (this.spinner) this.spinner.stop();
    
    // Truncate long commands
    const maxLen = 60;
    const displayCmd = cmd.length > maxLen 
      ? cmd.slice(0, maxLen) + '...'
      : cmd;
    
    console.log(chalk.yellow(`\n   ${ICONS.warning} Command requires confirmation:`));
    console.log(chalk.white(`   $ ${displayCmd}`));
    
    // Create fresh readline for confirmation
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: process.stdin.isTTY,
      });
      
      rl.question(chalk.cyan('   Allow? (y/n): '), (answer) => {
        const allowed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
        console.log(allowed ? chalk.green(`   ${ICONS.success} Allowed`) : chalk.red(`   ${ICONS.error} Denied`));
        rl.close();
        resolve(allowed);
      });
    });
  }

  /**
   * Show pending tasks (plan)
   */
  showPendingTasks() {
    if (this.pendingTasks.length === 0) return;
    
    const pending = this.pendingTasks.filter(t => t.status === 'pending').length;
    const inProgress = this.pendingTasks.filter(t => t.status === 'progress').length;
    const completed = this.pendingTasks.filter(t => t.status === 'done').length;
    
    console.log(chalk.cyan(`   PLAN`) + chalk.gray(`   Updated: ${this.pendingTasks.length} total (${pending} pending, ${inProgress} in progress, ${completed} completed)\n`));
    
    this.pendingTasks.forEach(task => {
      const icon = task.status === 'done' ? chalk.green('●') : 
                   task.status === 'progress' ? chalk.yellow('◐') : 
                   chalk.gray('○');
      console.log(`   ${icon} ${task.text}`);
    });
    console.log();
  }

  /**
   * Show help
   */
  showHelp() {
    console.log(chalk.cyan.bold('\nCommands:\n'));
    console.log(chalk.white('  /help       ') + chalk.gray('Show this help'));
    console.log(chalk.white('  /exit       ') + chalk.gray('Exit chat'));
    console.log(chalk.white('  /clear      ') + chalk.gray('Clear conversation'));
    console.log(chalk.white('  /save       ') + chalk.gray('Save session'));
    console.log();
    console.log(chalk.cyan.bold('Quick Actions:\n'));
    console.log(chalk.white('  /files      ') + chalk.gray('List files'));
    console.log(chalk.white('  /read <f>   ') + chalk.gray('Read file'));
    console.log(chalk.white('  /run <cmd>  ') + chalk.gray('Run command'));
    console.log(chalk.white('  /undo       ') + chalk.gray('Undo last change'));
    console.log(chalk.white('  /diff       ') + chalk.gray('Show changes'));
    console.log();
    console.log(chalk.cyan.bold('Info:\n'));
    console.log(chalk.white('  /context    ') + chalk.gray('Project info'));
    console.log(chalk.white('  /tokens     ') + chalk.gray('Token usage'));
    console.log(chalk.white('  /provider   ') + chalk.gray('Switch provider'));
    console.log();
  }

  /**
   * List files
   */
  async listFiles(path) {
    const result = await executeTool('list_directory', { path: path || '.' });
    if (result.error) {
      console.log(chalk.red(`${ICONS.error} ${result.error}\n`));
    } else {
      console.log(chalk.cyan(`\n   LIST DIRECTORY`) + chalk.gray(` (${path || '.'})`));
      for (const entry of (result.entries || []).slice(0, 20)) {
        const icon = entry.type === 'directory' ? ICONS.folder : ICONS.file;
        console.log(chalk.gray(`   ${icon} ${entry.name}`));
      }
      if (result.entries?.length > 20) {
        console.log(chalk.gray(`   ... and ${result.entries.length - 20} more`));
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
      console.log(chalk.red(`${ICONS.error} ${result.error}\n`));
    } else {
      console.log(chalk.cyan(`\n   READ`) + chalk.gray(` (${path})`));
      console.log(chalk.gray(`   ${ICONS.arrow} ${result.totalLines || '?'} lines\n`));
      console.log(result.content?.slice(0, 1000));
      if (result.content?.length > 1000) {
        console.log(chalk.gray(`\n   ... truncated (${result.content.length} total chars)`));
      }
      console.log();
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
    
    console.log(chalk.cyan(`\n   RUN`) + chalk.gray(` $ ${cmd}`));
    const result = await executeTool('run_command', { command: cmd });
    
    if (result.error) {
      console.log(chalk.red(`   ${ICONS.arrow} ${ICONS.error} ${result.error}\n`));
    } else {
      if (result.stdout) {
        console.log(result.stdout.slice(0, 500));
      }
      if (result.stderr) {
        console.log(chalk.yellow(result.stderr.slice(0, 200)));
      }
      console.log(chalk.gray(`   ${ICONS.arrow} Exit: ${result.exitCode || 0}\n`));
    }
  }

  /**
   * Undo last change
   */
  async undoLastChange() {
    const undo = getUndoManager();
    const result = await undo.undo();
    
    if (result.success) {
      console.log(chalk.green(`${ICONS.success} ${result.message}\n`));
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
    
    console.log(chalk.cyan('\n   RECENT CHANGES\n'));
    changes.forEach((c, i) => {
      const time = new Date(c.time).toLocaleTimeString();
      console.log(chalk.gray(`   ${i + 1}. [${time}] ${c.operation}: ${c.file}`));
    });
    console.log();
  }

  /**
   * Show project context
   */
  async showProjectContext() {
    const info = await getProjectInfo();
    
    console.log(chalk.cyan('\n   PROJECT INFO\n'));
    console.log(chalk.gray(`   Type: ${info.type}`));
    console.log(chalk.gray(`   Dir: ${info.directory}`));
    
    if (info.files?.length > 0) {
      console.log(chalk.gray('\n   Key files:'));
      info.files.forEach(f => {
        console.log(chalk.gray(`   ${ICONS.bullet} ${f.name}`));
      });
    }
    console.log();
  }

  /**
   * Show token usage
   */
  showTokenUsage() {
    const total = this.tokenUsage.prompt + this.tokenUsage.completion;
    const cost = (this.tokenUsage.prompt * 0.00003) + (this.tokenUsage.completion * 0.00006);
    
    console.log(chalk.cyan('\n   TOKEN USAGE\n'));
    console.log(chalk.gray(`   Prompt: ${this.tokenUsage.prompt.toLocaleString()}`));
    console.log(chalk.gray(`   Completion: ${this.tokenUsage.completion.toLocaleString()}`));
    console.log(chalk.gray(`   Total: ${total.toLocaleString()}`));
    console.log(chalk.gray(`   Est. Cost: $${cost.toFixed(4)}`));
    console.log();
  }

  /**
   * Exit the REPL
   */
  async exit() {
    this.running = false;
    await autoSave();
    console.log(chalk.gray(`\n${ICONS.success} Session saved. Goodbye! 👋\n`));
  }
}

export default { ChatRepl };

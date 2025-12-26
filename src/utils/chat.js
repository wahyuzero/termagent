import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { select } from '@inquirer/prompts';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { createAgent } from '../agent/index.js';
import config from '../config/index.js';
import { getUndoManager } from './undo.js';
import { getProjectInfo } from './context.js';
import { getGitPrompt } from './git.js';
import { autoSave, loadLastSession, newConversation, getMessages } from '../conversation/index.js';
import { executeTool } from '../tools/index.js';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import costTracker from './cost.js';

// Configure marked for terminal rendering
marked.setOptions({
  renderer: new TerminalRenderer({
    // Text formatting
    reflowText: true,
    width: Math.min(process.stdout.columns || 80, 100),
    
    // Code blocks styling
    code: chalk.bgGray.white,
    codespan: chalk.cyan,
    
    // Heading styling  
    firstHeading: chalk.bold.cyan,
    heading: chalk.bold.white,
    
    // Table styling
    tableOptions: {
      chars: {
        'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
        'right': '│', 'right-mid': '┤', 'middle': '│'
      }
    },
  }),
});

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

// Available slash commands for autocomplete
const SLASH_COMMANDS = [
  { value: '/help', name: '/help - Show help', description: 'Show available commands' },
  { value: '/exit', name: '/exit - Exit chat', description: 'Exit the chat' },
  { value: '/clear', name: '/clear - Clear conversation', description: 'Start fresh' },
  { value: '/files', name: '/files - List files', description: 'List directory contents' },
  { value: '/read', name: '/read <file> - Read file', description: 'Read file content' },
  { value: '/run', name: '/run <cmd> - Run command', description: 'Execute shell command' },
  { value: '/undo', name: '/undo - Undo last change', description: 'Undo file change' },
  { value: '/diff', name: '/diff - Show changes', description: 'Recent file changes' },
  { value: '/context', name: '/context - Project info', description: 'Show project context' },
  { value: '/tokens', name: '/tokens - Token usage', description: 'Show token count' },
  { value: '/status', name: '/status - Session status', description: 'Current session info' },
  { value: '/provider', name: '/provider - Switch provider', description: 'Change AI provider' },
  { value: '/export', name: '/export - Export chat', description: 'Save to markdown' },
  { value: '/save', name: '/save - Save session', description: 'Save current session' },
];

/**
 * Format error message with helpful suggestions
 */
function formatError(error) {
  const msg = error.message || String(error);
  let suggestion = '';
  
  // Common error patterns with suggestions
  if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key')) {
    suggestion = '\n   💡 Check your API key: /status or set env var';
  } else if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
    suggestion = '\n   💡 Rate limited. Wait a moment and try again, or switch provider: /p';
  } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    suggestion = '\n   💡 Request timed out. Check your connection or try again';
  } else if (msg.includes('ECONNREFUSED') || msg.includes('network') || msg.includes('fetch failed')) {
    suggestion = '\n   💡 Network error. Check your internet connection';
  } else if (msg.includes('model') && msg.includes('not found')) {
    suggestion = '\n   💡 Model not available. Try: /p to switch model';
  } else if (msg.includes('context length') || msg.includes('too long')) {
    suggestion = '\n   💡 Message too long. Try: /clear to reset conversation';
  }
  
  return `${ICONS.error} Error: ${msg}${chalk.gray(suggestion)}`;
}

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
    this.elapsedInterval = null;  // For clearing "Thinking..." timer
    this.tokenUsage = { prompt: 0, completion: 0 };
    this.pendingTasks = [];
    this.commandHistory = [];
    this.maxHistorySize = 100;
    
    // Auto-continue settings
    this.autoContinue = true;          // Enable auto-continue
    this.autoContinueMax = 8;           // Max auto-continue attempts
    this.autoContinueCount = 0;         // Current attempt count
    this.lastToolCallCount = 0;         // Track if AI was doing tool calls
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
   * Features: git status, command history, interactive slash menu
   */
  async promptNext() {
    if (!this.running) {
      this.cleanup();
      return;
    }
    
    // Get git status for prompt
    const gitStatus = await getGitPrompt();
    const gitPart = gitStatus ? chalk.magenta(`${gitStatus} `) : '';
    const prompt = `${gitPart}${chalk.green('>')} `;
    
    // Create readline with history
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY,
      history: this.commandHistory.slice().reverse(),
      historySize: this.maxHistorySize,
    });
    
    rl.question(prompt, async (answer) => {
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
      
      // Add to history (if not empty and not duplicate)
      if (input && (this.commandHistory.length === 0 || this.commandHistory[this.commandHistory.length - 1] !== input)) {
        this.commandHistory.push(input);
        if (this.commandHistory.length > this.maxHistorySize) {
          this.commandHistory.shift();
        }
      }
      
      // Check if user typed just "/" - show interactive menu
      if (input === '/') {
        try {
          const selected = await select({
            message: 'Select command:',
            choices: SLASH_COMMANDS,
            pageSize: 10,
          });
          
          // Handle the selected command
          if (selected) {
            await this.handleInput(selected);
          }
        } catch {
          // User cancelled (Ctrl+C)
        }
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
    console.log(chalk.cyan.bold('║') + chalk.white.bold('  🤖 TermAgent Interactive Mode        ') + chalk.cyan.bold('║'));
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
      case 'f':
        await this.listFiles(arg);
        break;

      case 'read':
      case 'cat':
      case 'r':
        await this.readFile(arg);
        break;

      case 'run':
      case 'exec':
      case 'x':
        await this.runCommand(arg);
        break;

      case 'undo':
      case 'u':
        await this.undoLastChange();
        break;

      case 'diff':
      case 'changes':
      case 'd':
        await this.showRecentChanges();
        break;

      case 'context':
      case 'project':
      case 'c':
        await this.showProjectContext();
        break;

      case 'save':
      case 's':
        await autoSave();
        console.log(chalk.green(`${ICONS.success} Session saved\n`));
        break;

      case 'tokens':
      case 'usage':
      case 't':
        this.showTokenUsage();
        break;

      case 'provider':
      case 'p':
        if (arg) {
          try {
            const [provider, model] = arg.split(' ');
            config.setProvider(provider, model);
            console.log(chalk.green(`${ICONS.success} Switched to ${provider}${model ? '/' + model : ''}\n`));
          } catch (e) {
            console.log(chalk.red(`${ICONS.error} ${e.message}\n`));
          }
        } else {
          await this.showProviderMenu();
        }
        break;

      case 'status':
        this.showStatus();
        break;

      case 'export':
      case 'e':
        await this.exportConversation(arg);
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
    this.lastToolCallCount = 0;  // Reset tool call counter
    
    // Elapsed time counter
    const startTime = Date.now();
    
    // Show thinking with elapsed time
    process.stdout.write(chalk.cyan('\n⛬  ') + chalk.gray('Thinking... '));
    
    this.elapsedInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      process.stdout.write(`\r${chalk.cyan('⛬  ')}${chalk.gray('Thinking...')} ${chalk.yellow(`${elapsed}s`)}`);
    }, 1000);
    
    this.spinner = null;

    let response = '';
    let hasContent = false;

    try {
      let pendingMarkdown = '';
      
      for await (const chunk of this.agent.chat(message)) {
        if (chunk.type === 'content') {
          // Stop elapsed timer on first content
          if (this.elapsedInterval) {
            clearInterval(this.elapsedInterval);
            this.elapsedInterval = null;
          }
          
          if (!hasContent) {
            // Clear the "Thinking..." line and show response header
            process.stdout.write('\r\x1b[K');
            console.log(chalk.cyan(ICONS.thinking) + '  ' + chalk.gray('Response:\n'));
            hasContent = true;
          }
          
          // Accumulate content
          response += chunk.content;
          pendingMarkdown += chunk.content;
          
          // Render completed paragraphs (when we see double newline)
          if (pendingMarkdown.includes('\n\n')) {
            const parts = pendingMarkdown.split(/\n\n/);
            // Render all complete paragraphs
            for (let i = 0; i < parts.length - 1; i++) {
              if (parts[i].trim()) {
                try {
                  const rendered = marked(parts[i] + '\n');
                  process.stdout.write(rendered);
                } catch {
                  process.stdout.write(parts[i] + '\n\n');
                }
              }
            }
            // Keep the incomplete part for next iteration
            pendingMarkdown = parts[parts.length - 1];
          }
          
        } else if (chunk.type === 'usage') {
          this.tokenUsage.prompt += chunk.promptTokens || 0;
          this.tokenUsage.completion += chunk.completionTokens || 0;
          // Track costs
          costTracker.track(
            config.getCurrentProvider(),
            chunk.promptTokens,
            chunk.completionTokens
          );
        } else if (chunk.type === 'error') {
          if (this.elapsedInterval) clearInterval(this.elapsedInterval);
          process.stdout.write('\r\x1b[K');
          console.log(chalk.red(`\n${formatError({message: chunk.error})}\n`));
        } else if (chunk.type === 'done') {
          if (this.elapsedInterval) clearInterval(this.elapsedInterval);
          
          // Render any remaining markdown
          if (pendingMarkdown.trim()) {
            try {
              const rendered = marked(pendingMarkdown);
              process.stdout.write(rendered);
            } catch {
              process.stdout.write(pendingMarkdown);
            }
          }
          
          if (hasContent) {
            console.log(''); // End with newline
          }
          
          // Show cost footer
          const costFooter = costTracker.getCostFooter();
          if (costFooter) {
            console.log(chalk.gray(`   ${costFooter}\n`));
          }
          
          // Show pending tasks if any
          if (this.pendingTasks.length > 0) {
            this.showPendingTasks();
          }
          
          // Auto-save
          await autoSave();
          
          // Check if we should auto-continue
          if (this.autoContinue && this.shouldAutoContinue(response, this.lastToolCallCount)) {
            if (this.autoContinueCount < this.autoContinueMax) {
              this.autoContinueCount++;
              console.log(chalk.gray(`   ⟳ Auto-continuing (${this.autoContinueCount}/${this.autoContinueMax})...\n`));
              this.processing = false;
              // Recursively continue
              await this.sendMessage('continue');
              return;
            } else {
              console.log(chalk.gray(`   ℹ Auto-continue limit reached. Type "continue" to continue manually.\n`));
            }
          } else {
            // Reset counter on successful complete response
            this.autoContinueCount = 0;
          }
        }
      }
    } catch (error) {
      if (this.elapsedInterval) clearInterval(this.elapsedInterval);
      process.stdout.write('\r\x1b[K'); // Clear line
      console.log(chalk.red(`\n${formatError(error)}\n`));
    }
    
    // Estimate tokens if API didn't provide usage data
    // Rough estimate: ~4 characters per token
    if (this.tokenUsage.prompt === 0 && this.tokenUsage.completion === 0) {
      this.tokenUsage.prompt += Math.ceil(message.length / 4);
      this.tokenUsage.completion += Math.ceil(response.length / 4);
    }
    
    this.processing = false;
  }
  
  /**
   * Detect if response is incomplete and should auto-continue
   */
  shouldAutoContinue(response, toolCallCount) {
    // Don't continue if no activity
    if (!response && toolCallCount === 0) return false;
    
    // Detect incomplete patterns (Indonesian & English)
    const incompletePatterns = [
      /mari (kita )?lanjut/i,
      /selanjutnya/i,
      /let('s| me) continue/i,
      /next,? (I('ll| will)|we)/i,
      /sekarang (saya|kita) akan/i,
      /now (I('ll| will)|let me)/i,
      /\.{3}\s*$/,  // Ends with ...
    ];
    
    for (const pattern of incompletePatterns) {
      if (pattern.test(response)) return true;
    }
    
    // If there were tool calls but very short/no response, likely more to do
    if (toolCallCount > 2 && response.length < 50) return true;
    
    return false;
  }

  /**
   * Handle tool call with modern display
   */
  handleToolCall(tc) {
    // Track tool calls for auto-continue detection
    this.lastToolCallCount++;
    
    // Clear elapsed timer when tool call starts
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
      process.stdout.write('\r\x1b[K'); // Clear the 'Thinking...' line
    }
    
    if (this.spinner && this.spinner.isSpinning) {
      this.spinner.stop();
    }
    
    const { name, arguments: args } = tc;
    
    // Skip invalid tool calls (some models return malformed data)
    if (!name || typeof name !== 'string') {
      console.log(chalk.yellow(`\n   ${ICONS.warning} Skipped invalid tool call (no name)`));
      return;
    }
    
    // Format tool name nicely
    const toolDisplay = this.formatToolName(name, args || {});
    
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
   * Confirm dangerous command with always-allow option
   */
  async confirmCommand(cmd, reason) {
    // Clear elapsed timer before showing prompt
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
      process.stdout.write('\r\x1b[K'); // Clear the 'Thinking...' line
    }
    
    if (this.spinner) this.spinner.stop();
    
    // Initialize session allowed patterns if needed
    if (!this.sessionAllowedPatterns) {
      this.sessionAllowedPatterns = new Set();
    }
    
    // Extract command pattern (first word/binary)
    const cmdPattern = cmd.split(' ')[0].split('/').pop();
    
    // Check if already allowed for this session
    if (this.sessionAllowedPatterns.has(cmdPattern)) {
      console.log(chalk.gray(`\n   ${ICONS.success} Auto-allowed: ${cmdPattern}`));
      return true;
    }
    
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
      
      rl.question(chalk.cyan('   Allow? (y/n/a=always): '), (answer) => {
        rl.close();
        
        const choice = answer.toLowerCase().trim();
        
        if (choice === 'a' || choice === 'always') {
          // Add to session allowed patterns
          this.sessionAllowedPatterns.add(cmdPattern);
          console.log(chalk.green(`   ${ICONS.success} Allowed (always for "${cmdPattern}" this session)`));
          resolve(true);
        } else if (choice === 'y' || choice === 'yes') {
          console.log(chalk.green(`   ${ICONS.success} Allowed`));
          resolve(true);
        } else {
          console.log(chalk.red(`   ${ICONS.error} Denied`));
          resolve(false);
        }
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
    console.log(chalk.cyan.bold('\n📖 COMMANDS') + chalk.gray(' (shortcuts in parentheses)\n'));
    
    console.log(chalk.white('  /help, /h   ') + chalk.gray('Show this help'));
    console.log(chalk.white('  /exit, /q   ') + chalk.gray('Exit chat'));
    console.log(chalk.white('  /clear      ') + chalk.gray('Clear conversation'));
    console.log(chalk.white('  /save, /s   ') + chalk.gray('Save session'));
    console.log(chalk.white('  /export, /e ') + chalk.gray('Export to markdown'));
    console.log();
    
    console.log(chalk.cyan.bold('⚡ Quick Actions\n'));
    console.log(chalk.white('  /files, /f      ') + chalk.gray('List files'));
    console.log(chalk.white('  /read, /r <f>   ') + chalk.gray('Read file'));
    console.log(chalk.white('  /run, /x <cmd>  ') + chalk.gray('Run command'));
    console.log(chalk.white('  /undo, /u       ') + chalk.gray('Undo last change'));
    console.log(chalk.white('  /diff, /d       ') + chalk.gray('Show changes'));
    console.log();
    
    console.log(chalk.cyan.bold('📊 Info\n'));
    console.log(chalk.white('  /context, /c  ') + chalk.gray('Project info'));
    console.log(chalk.white('  /tokens, /t   ') + chalk.gray('Token usage'));
    console.log(chalk.white('  /status       ') + chalk.gray('Session status'));
    console.log(chalk.white('  /provider, /p ') + chalk.gray('Switch provider (interactive)'));
    console.log();
    
    console.log(chalk.gray('💡 Tips:'));
    console.log(chalk.gray('  • Type "/" alone for interactive command menu'));
    console.log(chalk.gray('  • Use ↑/↓ arrows to navigate command history'));
    console.log(chalk.gray('  • Type "a" at confirmation to always-allow'));
    console.log(chalk.gray('  • Git branch shown in prompt (e.g., main* >)'));
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
    
    console.log(chalk.cyan('\n   TOKEN USAGE') + chalk.gray(' (estimated)\n'));
    console.log(chalk.gray(`   Prompt: ${this.tokenUsage.prompt.toLocaleString()}`));
    console.log(chalk.gray(`   Completion: ${this.tokenUsage.completion.toLocaleString()}`));
    console.log(chalk.gray(`   Total: ${total.toLocaleString()}`));
    console.log(chalk.gray(`   Est. Cost: $${cost.toFixed(4)}`));
    console.log();
  }

  /**
   * Show interactive provider selection menu
   */
  async showProviderMenu() {
    const { defaults } = await import('../config/defaults.js');
    const providers = Object.keys(defaults.providers);
    
    console.log(chalk.cyan('\n   SWITCH PROVIDER\n'));
    console.log(chalk.gray(`   Current: ${config.getCurrentProvider()}/${config.getCurrentModel()}\n`));
    
    providers.forEach((p, i) => {
      const hasKey = config.getApiKey(p);
      const status = hasKey ? chalk.green('✓') : chalk.red('✗');
      const current = p === config.getCurrentProvider() ? chalk.cyan(' ←') : '';
      const free = ['groq', 'zai', 'gemini', 'mistral', 'openrouter'].includes(p) ? chalk.green(' (free)') : '';
      console.log(chalk.white(`   [${i + 1}] ${status} ${p}${free}${current}`));
    });
    
    console.log(chalk.gray('\n   [0] Cancel\n'));
    
    // Get selection
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: process.stdin.isTTY,
      });
      
      rl.question(chalk.cyan('   Select [0-' + providers.length + ']: '), async (answer) => {
        rl.close();
        
        const choice = parseInt(answer, 10);
        if (choice === 0 || isNaN(choice)) {
          console.log(chalk.gray('   Cancelled\n'));
          resolve();
          return;
        }
        
        if (choice >= 1 && choice <= providers.length) {
          const selectedProvider = providers[choice - 1];
          const providerConfig = defaults.providers[selectedProvider];
          
          // Show model selection
          console.log(chalk.cyan('\n   SELECT MODEL\n'));
          providerConfig.models.forEach((m, i) => {
            const isDefault = m === providerConfig.defaultModel ? chalk.gray(' (default)') : '';
            console.log(chalk.white(`   [${i + 1}] ${m}${isDefault}`));
          });
          
          const rl2 = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: process.stdin.isTTY,
          });
          
          rl2.question(chalk.cyan('\n   Select model [1-' + providerConfig.models.length + ']: '), (modelAnswer) => {
            rl2.close();
            
            const modelChoice = parseInt(modelAnswer, 10);
            const model = (modelChoice >= 1 && modelChoice <= providerConfig.models.length) 
              ? providerConfig.models[modelChoice - 1]
              : providerConfig.defaultModel;
            
            try {
              config.setProvider(selectedProvider, model);
              console.log(chalk.green(`\n   ${ICONS.success} Switched to ${selectedProvider}/${model}\n`));
            } catch (e) {
              console.log(chalk.red(`\n   ${ICONS.error} ${e.message}\n`));
            }
            resolve();
          });
        } else {
          console.log(chalk.red('   Invalid choice\n'));
          resolve();
        }
      });
    });
  }

  /**
   * Show session status
   */
  showStatus() {
    console.log(chalk.cyan('\n   SESSION STATUS\n'));
    console.log(chalk.gray(`   Provider: ${chalk.white(config.getCurrentProvider())}/${chalk.white(config.getCurrentModel())}`));
    console.log(chalk.gray(`   Directory: ${chalk.white(process.cwd())}`));
    console.log(chalk.gray(`   Session: ${chalk.white(this.options.continue ? 'Continued' : 'New')}`));
    
    const total = this.tokenUsage.prompt + this.tokenUsage.completion;
    console.log(chalk.gray(`   Tokens: ${chalk.white(total.toLocaleString())} (estimated)`));
    
    if (this.sessionAllowedPatterns && this.sessionAllowedPatterns.size > 0) {
      console.log(chalk.gray(`   Auto-allowed: ${chalk.white(this.sessionAllowedPatterns.size)} command patterns`));
    }
    console.log();
  }

  /**
   * Export conversation to markdown file
   */
  async exportConversation(filename) {
    try {
      const messages = getMessages();
      
      if (!messages || messages.length === 0) {
        console.log(chalk.yellow(`\n${ICONS.warning} No conversation to export\n`));
        return;
      }
      
      // Generate markdown
      const date = new Date().toISOString().split('T')[0];
      const time = new Date().toLocaleTimeString();
      let md = `# TermAgent Conversation\n\n`;
      md += `**Date:** ${date} ${time}\n`;
      md += `**Provider:** ${config.getCurrentProvider()}/${config.getCurrentModel()}\n`;
      md += `**Directory:** ${process.cwd()}\n\n`;
      md += `---\n\n`;
      
      for (const msg of messages) {
        if (msg.role === 'system') {
          // Skip system messages or add as collapsed section
          continue;
        } else if (msg.role === 'user') {
          md += `## 👤 User\n\n${msg.content}\n\n`;
        } else if (msg.role === 'assistant') {
          md += `## 🤖 Assistant\n\n`;
          
          if (msg.content) {
            md += `${msg.content}\n\n`;
          }
          
          // Handle tool calls
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            md += `### Tool Calls\n\n`;
            for (const tc of msg.tool_calls) {
              const name = tc.function?.name || tc.name || 'unknown';
              const args = tc.function?.arguments || tc.arguments || {};
              md += `<details>\n<summary>📌 ${name}</summary>\n\n`;
              md += `\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n\n`;
              md += `</details>\n\n`;
            }
          }
        } else if (msg.role === 'tool') {
          // Tool results
          const content = msg.content?.slice(0, 500) || '(no content)';
          md += `<details>\n<summary>🔧 Tool Result: ${msg.name || 'result'}</summary>\n\n`;
          md += `\`\`\`\n${content}${msg.content?.length > 500 ? '...' : ''}\n\`\`\`\n\n`;
          md += `</details>\n\n`;
        }
      }
      
      md += `---\n\n*Exported by TermAgent*\n`;
      
      // Save file
      const outputFile = filename || `termagent-export-${date}.md`;
      const outputPath = join(process.cwd(), outputFile);
      await writeFile(outputPath, md, 'utf-8');
      
      console.log(chalk.green(`\n${ICONS.success} Exported to: ${outputFile}\n`));
      
    } catch (error) {
      console.log(chalk.red(`\n${ICONS.error} Export failed: ${error.message}\n`));
    }
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

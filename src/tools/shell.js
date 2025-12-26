import { spawn } from 'child_process';

/**
 * Shell Command Tool Definitions
 */
export const definitions = [
  {
    name: 'run_command',
    description:
      'Execute a shell command. Use this to run terminal commands, scripts, or system utilities. Commands that could be dangerous will require user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (optional)',
        },
        timeout: {
          type: 'integer',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['command'],
    },
  },
];

// Commands that are considered safe to auto-approve
const SAFE_COMMANDS = [
  'ls',
  'cat',
  'head',
  'tail',
  'pwd',
  'echo',
  'which',
  'whoami',
  'date',
  'cal',
  'env',
  'printenv',
  'uname',
  'hostname',
  'df',
  'du',
  'free',
  'uptime',
  'wc',
  'sort',
  'uniq',
  'grep',
  'find',
  'tree',
  'file',
  'stat',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git remote',
  'node --version',
  'npm --version',
  'npm list',
  'python --version',
  'pip list',
];

// Commands that are considered dangerous and always require confirmation
const DANGEROUS_PATTERNS = [
  /\brm\s+(-rf?|--recursive)/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bchmod\b.*777/i,
  /\bchown\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\//i,
  /\bcurl\b.*\|\s*(ba)?sh/i,
  /\bwget\b.*\|\s*(ba)?sh/i,
  /\bnpm\s+(install|i)\s+-g/i,
  /\bpip\s+install\b/i,
  /\bapt\b/i,
  /\bpkg\s+(install|remove)/i,
];

/**
 * Check if command is safe to auto-approve
 * @param {string} command - Command to check
 * @returns {Object} - { safe: boolean, reason?: string }
 */
export function checkCommandSafety(command) {
  const trimmed = command.trim().toLowerCase();

  // Check dangerous patterns first
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        safe: false,
        reason: 'Command matches a dangerous pattern',
        requiresConfirmation: true,
      };
    }
  }

  // Check if starts with safe command
  for (const safe of SAFE_COMMANDS) {
    if (trimmed.startsWith(safe.toLowerCase())) {
      return { safe: true };
    }
  }

  // Default to requiring confirmation for unknown commands
  return {
    safe: false,
    reason: 'Unknown command - requires confirmation',
    requiresConfirmation: true,
  };
}

/**
 * Execute shell command
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Tool result
 */
export async function execute(name, args, options = {}) {
  if (name !== 'run_command') {
    return { error: `Unknown shell tool: ${name}` };
  }

  const { command, cwd, timeout = 30000 } = args;
  const { confirmCallback, autoApproveReadOnly = true } = options;

  // Check safety
  const safety = checkCommandSafety(command);

  if (!safety.safe && safety.requiresConfirmation) {
    if (confirmCallback) {
      const confirmed = await confirmCallback(command, safety.reason);
      if (!confirmed) {
        return {
          success: false,
          error: 'Command was rejected by user',
          command,
        };
      }
    } else if (!autoApproveReadOnly) {
      return {
        success: false,
        error: 'Command requires confirmation but no callback provided',
        command,
        reason: safety.reason,
      };
    }
  }

  try {
    const result = await runCommand(command, { cwd, timeout });
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      command,
    };
  }
}

/**
 * Run a shell command
 * @param {string} command - Command to run
 * @param {Object} options - Options
 * @returns {Promise<Object>}
 */
function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeout = 30000 } = options;
    
    // Detect background commands
    const isBackground = command.trim().endsWith('&');
    // Use shorter timeout for background commands (just wait for startup)
    const effectiveTimeout = isBackground ? 3000 : timeout;

    const child = spawn('sh', ['-c', command], {
      cwd,
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // For background commands, detach from parent
      detached: isBackground,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      if (isBackground) {
        // For background commands, "timeout" is expected - process is running
        child.unref(); // Allow parent to exit without waiting
        resolve({
          success: true,
          command,
          background: true,
          message: 'Background process started',
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          pid: child.pid,
        });
      } else {
        // For foreground commands, timeout is an error
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
      }
    }, effectiveTimeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Limit output size
      if (stdout.length > 100000) {
        stdout = stdout.slice(-100000);
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > 50000) {
        stderr = stderr.slice(-50000);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (killed && !isBackground) {
        resolve({
          success: false,
          error: `Command timed out after ${effectiveTimeout}ms`,
          command,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
        return;
      }

      resolve({
        success: code === 0,
        exitCode: code,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        output: stdout.trim() || stderr.trim(),
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export default { definitions, execute, checkCommandSafety };

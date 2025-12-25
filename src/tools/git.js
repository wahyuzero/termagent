import { spawn } from 'child_process';
import { resolve } from 'path';

/**
 * Git Tool Definitions
 */
export const definitions = [
  {
    name: 'git_status',
    description: 'Get the current git status showing modified, staged, and untracked files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the git repository (default: current directory)',
        },
      },
      required: [],
    },
  },
  {
    name: 'git_diff',
    description: 'Show the diff of changes for a file or the entire repository.',
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Specific file to diff (optional, shows all if not provided)',
        },
        staged: {
          type: 'boolean',
          description: 'Show staged changes instead of unstaged (default: false)',
        },
        path: {
          type: 'string',
          description: 'Path to the git repository',
        },
      },
      required: [],
    },
  },
  {
    name: 'git_log',
    description: 'Show recent git commits.',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'integer',
          description: 'Number of commits to show (default: 10)',
        },
        file: {
          type: 'string',
          description: 'Show commits for a specific file',
        },
        oneline: {
          type: 'boolean',
          description: 'Show compact one-line format (default: true)',
        },
        path: {
          type: 'string',
          description: 'Path to the git repository',
        },
      },
      required: [],
    },
  },
  {
    name: 'git_branch',
    description: 'List git branches or get current branch.',
    parameters: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'Show all branches including remote (default: false)',
        },
        path: {
          type: 'string',
          description: 'Path to the git repository',
        },
      },
      required: [],
    },
  },
  {
    name: 'git_show',
    description: 'Show the contents of a specific commit.',
    parameters: {
      type: 'object',
      properties: {
        commit: {
          type: 'string',
          description: 'Commit hash or reference (e.g., HEAD, HEAD~1)',
        },
        path: {
          type: 'string',
          description: 'Path to the git repository',
        },
      },
      required: ['commit'],
    },
  },
];

/**
 * Execute git tool
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool result
 */
export async function execute(name, args) {
  try {
    switch (name) {
      case 'git_status':
        return await gitStatus(args);
      case 'git_diff':
        return await gitDiff(args);
      case 'git_log':
        return await gitLog(args);
      case 'git_branch':
        return await gitBranch(args);
      case 'git_show':
        return await gitShow(args);
      default:
        return { error: `Unknown git tool: ${name}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Run a git command
 */
async function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, GIT_PAGER: 'cat' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0 && stderr.includes('not a git repository')) {
        reject(new Error('Not a git repository'));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });

    child.on('error', reject);
  });
}

async function gitStatus({ path: repoPath }) {
  const cwd = repoPath ? resolve(repoPath) : process.cwd();

  // Get porcelain status for parsing
  const { stdout } = await runGit(['status', '--porcelain', '-b'], cwd);
  const lines = stdout.split('\n');

  const branch = lines[0]?.replace('## ', '').split('...')[0] || 'unknown';

  const files = {
    staged: [],
    modified: [],
    untracked: [],
  };

  for (const line of lines.slice(1)) {
    if (!line) continue;
    const status = line.substring(0, 2);
    const file = line.substring(3);

    if (status[0] !== ' ' && status[0] !== '?') {
      files.staged.push({ file, status: status[0] });
    }
    if (status[1] === 'M' || status[1] === 'D') {
      files.modified.push({ file, status: status[1] });
    }
    if (status === '??') {
      files.untracked.push(file);
    }
  }

  return {
    success: true,
    branch,
    ...files,
    clean:
      files.staged.length === 0 &&
      files.modified.length === 0 &&
      files.untracked.length === 0,
  };
}

async function gitDiff({ file, staged = false, path: repoPath }) {
  const cwd = repoPath ? resolve(repoPath) : process.cwd();
  const args = ['diff'];

  if (staged) args.push('--staged');
  if (file) args.push(file);

  const { stdout } = await runGit(args, cwd);

  // Truncate if too long
  const maxLength = 10000;
  const truncated = stdout.length > maxLength;
  const diff = truncated ? stdout.substring(0, maxLength) + '\n... (truncated)' : stdout;

  return {
    success: true,
    diff: diff || 'No changes',
    truncated,
  };
}

async function gitLog({
  count = 10,
  file,
  oneline = true,
  path: repoPath,
}) {
  const cwd = repoPath ? resolve(repoPath) : process.cwd();
  const args = ['log', `-${count}`];

  if (oneline) {
    args.push('--oneline');
  } else {
    args.push('--pretty=format:%h %an %ar %s');
  }

  if (file) args.push('--', file);

  const { stdout } = await runGit(args, cwd);
  const commits = stdout.split('\n').filter((l) => l).map((line) => {
    const parts = line.split(' ');
    return {
      hash: parts[0],
      message: parts.slice(1).join(' '),
    };
  });

  return {
    success: true,
    commits,
  };
}

async function gitBranch({ all = false, path: repoPath }) {
  const cwd = repoPath ? resolve(repoPath) : process.cwd();
  const args = ['branch'];

  if (all) args.push('-a');

  const { stdout } = await runGit(args, cwd);
  const branches = stdout.split('\n').filter((l) => l).map((line) => ({
    name: line.replace(/^\*?\s+/, '').trim(),
    current: line.startsWith('*'),
  }));

  const current = branches.find((b) => b.current)?.name;

  return {
    success: true,
    current,
    branches: branches.map((b) => b.name),
  };
}

async function gitShow({ commit, path: repoPath }) {
  const cwd = repoPath ? resolve(repoPath) : process.cwd();

  const { stdout } = await runGit(['show', commit, '--stat'], cwd);

  // Truncate if too long
  const maxLength = 5000;
  const truncated = stdout.length > maxLength;
  const content = truncated
    ? stdout.substring(0, maxLength) + '\n... (truncated)'
    : stdout;

  return {
    success: true,
    commit,
    content,
    truncated,
  };
}

export default { definitions, execute };

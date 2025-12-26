/**
 * Build Tools
 * Project build, bundle, and development utilities
 */

import { spawn } from 'child_process';
import { readFile, stat } from 'fs/promises';
import { resolve, join } from 'path';

/**
 * Tool Definitions
 */
export const definitions = [
  {
    name: 'project_build',
    description: 'Build a project. Auto-detects build system (npm, yarn, make, etc.).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to project directory (default: current dir)',
        },
        script: {
          type: 'string',
          description: 'Build script name (default: build)',
        },
      },
    },
  },
  {
    name: 'project_dev',
    description: 'Start development server for a project.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to project directory',
        },
        script: {
          type: 'string',
          description: 'Dev script name (default: dev or start)',
        },
      },
    },
  },
  {
    name: 'project_install',
    description: 'Install project dependencies.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to project directory',
        },
        packageManager: {
          type: 'string',
          description: 'Package manager: npm, yarn, pnpm, pip (auto-detected)',
        },
      },
    },
  },
  {
    name: 'project_scripts',
    description: 'List available scripts in a project.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to project directory',
        },
      },
    },
  },
  {
    name: 'run_script',
    description: 'Run a custom npm/yarn script.',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'Script name to run',
        },
        path: {
          type: 'string',
          description: 'Path to project directory',
        },
        args: {
          type: 'string',
          description: 'Additional arguments to pass',
        },
      },
      required: ['script'],
    },
  },
];

/**
 * Run shell command
 */
function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolvePromise) => {
    const proc = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 600000, // 10 min for builds
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data; });
    proc.stderr?.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      resolvePromise({ success: code === 0, code, stdout, stderr });
    });

    proc.on('error', (err) => {
      resolvePromise({ success: false, error: err.message });
    });
  });
}

/**
 * Check if file exists
 */
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect package manager
 */
async function detectPackageManager(dir) {
  if (await exists(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(join(dir, 'yarn.lock'))) return 'yarn';
  if (await exists(join(dir, 'package-lock.json'))) return 'npm';
  if (await exists(join(dir, 'package.json'))) return 'npm';
  if (await exists(join(dir, 'requirements.txt'))) return 'pip';
  if (await exists(join(dir, 'Makefile'))) return 'make';
  return null;
}

/**
 * Get package.json scripts
 */
async function getScripts(dir) {
  try {
    const pkgPath = join(dir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    return pkg.scripts || {};
  } catch {
    return {};
  }
}

/**
 * Execute tool
 */
export async function execute(name, args) {
  switch (name) {
    case 'project_build': {
      const dir = resolve(args.path || process.cwd());
      const pm = await detectPackageManager(dir);

      if (!pm) {
        return { error: 'Could not detect build system' };
      }

      let result;
      const scriptName = args.script || 'build';

      switch (pm) {
        case 'npm':
        case 'yarn':
        case 'pnpm':
          result = await runCommand(pm, ['run', scriptName], { cwd: dir });
          break;
        case 'make':
          result = await runCommand('make', [scriptName === 'build' ? '' : scriptName].filter(Boolean), { cwd: dir });
          break;
        case 'pip':
          result = await runCommand('python', ['setup.py', 'build'], { cwd: dir });
          break;
      }

      return {
        success: result.success,
        packageManager: pm,
        output: (result.stdout + '\n' + result.stderr).trim().slice(-5000),
      };
    }

    case 'project_dev': {
      const dir = resolve(args.path || process.cwd());
      const scripts = await getScripts(dir);
      
      // Find dev script
      let scriptName = args.script;
      if (!scriptName) {
        if (scripts.dev) scriptName = 'dev';
        else if (scripts.start) scriptName = 'start';
        else if (scripts.serve) scriptName = 'serve';
        else {
          return { 
            error: 'No dev/start/serve script found',
            availableScripts: Object.keys(scripts),
          };
        }
      }

      const pm = await detectPackageManager(dir);
      const result = await runCommand(pm || 'npm', ['run', scriptName], { 
        cwd: dir,
        timeout: 10000, // Short timeout, it'll run async
      });

      return {
        success: true,
        message: `Started dev server with '${scriptName}'`,
        startupOutput: (result.stdout + '\n' + result.stderr).trim().slice(-1000),
        note: 'Dev server running in background. Check terminal for full output.',
      };
    }

    case 'project_install': {
      const dir = resolve(args.path || process.cwd());
      const pm = args.packageManager || await detectPackageManager(dir);

      if (!pm) {
        return { error: 'Could not detect package manager' };
      }

      let result;
      switch (pm) {
        case 'npm':
          result = await runCommand('npm', ['install'], { cwd: dir });
          break;
        case 'yarn':
          result = await runCommand('yarn', ['install'], { cwd: dir });
          break;
        case 'pnpm':
          result = await runCommand('pnpm', ['install'], { cwd: dir });
          break;
        case 'pip':
          result = await runCommand('pip', ['install', '-r', 'requirements.txt'], { cwd: dir });
          break;
      }

      return {
        success: result.success,
        packageManager: pm,
        output: (result.stdout + '\n' + result.stderr).trim().slice(-2000),
      };
    }

    case 'project_scripts': {
      const dir = resolve(args.path || process.cwd());
      const scripts = await getScripts(dir);
      const pm = await detectPackageManager(dir);

      if (Object.keys(scripts).length === 0) {
        return {
          success: true,
          packageManager: pm,
          scripts: {},
          message: 'No scripts found in package.json',
        };
      }

      return {
        success: true,
        packageManager: pm,
        scripts,
        count: Object.keys(scripts).length,
      };
    }

    case 'run_script': {
      const dir = resolve(args.path || process.cwd());
      const pm = await detectPackageManager(dir);

      const cmdArgs = ['run', args.script];
      if (args.args) {
        cmdArgs.push('--', ...args.args.split(' '));
      }

      const result = await runCommand(pm || 'npm', cmdArgs, { cwd: dir });

      return {
        success: result.success,
        script: args.script,
        output: (result.stdout + '\n' + result.stderr).trim().slice(-3000),
      };
    }

    default:
      return { error: `Unknown build tool: ${name}` };
  }
}

export default { definitions, execute };

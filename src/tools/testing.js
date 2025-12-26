/**
 * Test Runner Tools
 * Run tests using various frameworks (Jest, Mocha, PyTest, etc.)
 */

import { spawn } from 'child_process';
import { stat } from 'fs/promises';
import { resolve, join } from 'path';

/**
 * Tool Definitions
 */
export const definitions = [
  {
    name: 'run_tests',
    description: 'Run tests in a project. Auto-detects test framework (Jest, Mocha, PyTest, etc.).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to project directory (default: current dir)',
        },
        pattern: {
          type: 'string',
          description: 'Test file pattern or specific test file',
        },
        framework: {
          type: 'string',
          description: 'Test framework: jest, mocha, pytest, unittest, vitest (auto-detected if not specified)',
        },
        coverage: {
          type: 'boolean',
          description: 'Run with coverage report',
        },
      },
    },
  },
  {
    name: 'run_single_test',
    description: 'Run a specific test file.',
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Path to test file',
        },
        testName: {
          type: 'string',
          description: 'Specific test name to run (optional)',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'list_tests',
    description: 'List available test files in a project.',
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
];

/**
 * Run shell command
 */
function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 300000, // 5 min timeout for tests
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data; });
    proc.stderr?.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      resolve({ success: code === 0, code, stdout, stderr });
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Check if file/directory exists
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
 * Detect test framework
 */
async function detectFramework(dir) {
  // Check package.json for test scripts and dependencies
  const pkgPath = join(dir, 'package.json');
  if (await exists(pkgPath)) {
    try {
      const { readFile } = await import('fs/promises');
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      
      // Check dependencies
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.jest) return 'jest';
      if (deps.vitest) return 'vitest';
      if (deps.mocha) return 'mocha';
      
      // Check scripts
      if (pkg.scripts?.test?.includes('jest')) return 'jest';
      if (pkg.scripts?.test?.includes('vitest')) return 'vitest';
      if (pkg.scripts?.test?.includes('mocha')) return 'mocha';
      if (pkg.scripts?.test) return 'npm'; // Generic npm test
    } catch {}
  }

  // Check for Python test frameworks
  if (await exists(join(dir, 'pytest.ini')) || await exists(join(dir, 'pyproject.toml'))) {
    return 'pytest';
  }
  if (await exists(join(dir, 'requirements.txt'))) {
    const content = await (await import('fs/promises')).readFile(join(dir, 'requirements.txt'), 'utf-8');
    if (content.includes('pytest')) return 'pytest';
  }

  // Check for test directories
  if (await exists(join(dir, '__tests__'))) return 'jest';
  if (await exists(join(dir, 'tests')) || await exists(join(dir, 'test'))) {
    // Might be either JS or Python
    return 'npm'; // Default to npm test
  }

  return null;
}

/**
 * Execute tool
 */
export async function execute(name, args) {
  switch (name) {
    case 'run_tests': {
      const dir = resolve(args.path || process.cwd());
      const framework = args.framework || await detectFramework(dir);

      if (!framework) {
        return { error: 'Could not detect test framework. Specify framework parameter.' };
      }

      let result;
      let cmd, cmdArgs;

      switch (framework) {
        case 'jest':
          cmd = 'npx';
          cmdArgs = ['jest'];
          if (args.pattern) cmdArgs.push(args.pattern);
          if (args.coverage) cmdArgs.push('--coverage');
          break;

        case 'vitest':
          cmd = 'npx';
          cmdArgs = ['vitest', 'run'];
          if (args.pattern) cmdArgs.push(args.pattern);
          if (args.coverage) cmdArgs.push('--coverage');
          break;

        case 'mocha':
          cmd = 'npx';
          cmdArgs = ['mocha'];
          if (args.pattern) cmdArgs.push(args.pattern);
          break;

        case 'pytest':
          cmd = 'python3';
          cmdArgs = ['-m', 'pytest', '-v'];
          if (args.pattern) cmdArgs.push(args.pattern);
          if (args.coverage) cmdArgs.push('--cov');
          break;

        case 'npm':
        default:
          cmd = 'npm';
          cmdArgs = ['test'];
          break;
      }

      result = await runCommand(cmd, cmdArgs, { cwd: dir });

      return {
        success: result.success,
        framework,
        output: (result.stdout + '\n' + result.stderr).trim().slice(-5000),
        passed: result.success,
      };
    }

    case 'run_single_test': {
      const file = resolve(args.file);
      const ext = file.split('.').pop();

      let result;
      if (ext === 'py') {
        const cmdArgs = ['-m', 'pytest', '-v', file];
        if (args.testName) cmdArgs.push('-k', args.testName);
        result = await runCommand('python3', cmdArgs);
      } else {
        // Assume JS test
        const cmdArgs = ['jest', file];
        if (args.testName) cmdArgs.push('-t', args.testName);
        result = await runCommand('npx', cmdArgs);
      }

      return {
        success: result.success,
        file: args.file,
        output: (result.stdout + '\n' + result.stderr).trim().slice(-3000),
      };
    }

    case 'list_tests': {
      const dir = resolve(args.path || process.cwd());
      
      // Find test files
      const result = await runCommand('find', [
        dir,
        '-type', 'f',
        '(',
        '-name', '*.test.js',
        '-o', '-name', '*.spec.js',
        '-o', '-name', 'test_*.py',
        '-o', '-name', '*_test.py',
        '-o', '-name', '*.test.ts',
        '-o', '-name', '*.spec.ts',
        ')',
        '-not', '-path', '*/node_modules/*',
        '-not', '-path', '*/.git/*',
      ], { timeout: 10000 });

      const files = result.stdout.split('\n').filter(f => f.trim());

      return {
        success: true,
        testFiles: files,
        count: files.length,
      };
    }

    default:
      return { error: `Unknown test tool: ${name}` };
  }
}

export default { definitions, execute };

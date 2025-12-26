/**
 * Security Tools
 * Security scanning, auditing, and hash generation
 */

import { createHash } from 'crypto';
import { readFile, stat } from 'fs/promises';
import { spawn } from 'child_process';
import { resolve } from 'path';

/**
 * Tool Definitions
 */
export const definitions = [
  {
    name: 'security_audit',
    description: 'Run security audit on project dependencies. Supports npm, pip, and yarn projects.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to project directory (default: current dir)',
        },
        type: {
          type: 'string',
          description: 'Package manager: npm, yarn, pip (auto-detected if not specified)',
        },
      },
    },
  },
  {
    name: 'hash_file',
    description: 'Generate hash of a file (MD5, SHA1, SHA256, SHA512).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file to hash',
        },
        algorithm: {
          type: 'string',
          description: 'Hash algorithm: md5, sha1, sha256, sha512 (default: sha256)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'hash_text',
    description: 'Generate hash of a text string.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to hash',
        },
        algorithm: {
          type: 'string',
          description: 'Hash algorithm: md5, sha1, sha256, sha512 (default: sha256)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'check_permissions',
    description: 'Check file/directory permissions for security issues.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to check',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'scan_secrets',
    description: 'Scan files for potential secrets (API keys, passwords, tokens).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file or directory to scan',
        },
      },
      required: ['path'],
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
      timeout: options.timeout || 120000,
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
 * Detect package manager
 */
async function detectPackageManager(dir) {
  const checks = [
    { file: 'package-lock.json', type: 'npm' },
    { file: 'yarn.lock', type: 'yarn' },
    { file: 'package.json', type: 'npm' },
    { file: 'requirements.txt', type: 'pip' },
    { file: 'Pipfile', type: 'pip' },
    { file: 'pyproject.toml', type: 'pip' },
  ];

  for (const check of checks) {
    try {
      await stat(resolve(dir, check.file));
      return check.type;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Secret patterns to scan for
 */
const SECRET_PATTERNS = [
  { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'Generic API Key', pattern: /api[_-]?key['":\s]*[=:]['":\s]*[a-zA-Z0-9]{20,}/gi },
  { name: 'Generic Secret', pattern: /secret['":\s]*[=:]['":\s]*[a-zA-Z0-9]{10,}/gi },
  { name: 'Password', pattern: /password['":\s]*[=:]['":\s]*[^\s'"]{6,}/gi },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g },
  { name: 'JWT', pattern: /eyJ[a-zA-Z0-9]{10,}\.[a-zA-Z0-9]{10,}\.[a-zA-Z0-9_-]{10,}/g },
];

/**
 * Execute tool
 */
export async function execute(name, args) {
  switch (name) {
    case 'security_audit': {
      const dir = args.path || process.cwd();
      const type = args.type || await detectPackageManager(dir);
      
      if (!type) {
        return { error: 'Could not detect package manager. Specify type: npm, yarn, or pip' };
      }

      let result;
      switch (type) {
        case 'npm':
          result = await runCommand('npm', ['audit', '--json'], { cwd: dir });
          break;
        case 'yarn':
          result = await runCommand('yarn', ['audit', '--json'], { cwd: dir });
          break;
        case 'pip':
          result = await runCommand('pip', ['check'], { cwd: dir });
          if (!result.success) {
            result = await runCommand('pip-audit', [], { cwd: dir });
          }
          break;
      }

      if (result.success) {
        return {
          success: true,
          packageManager: type,
          audit: result.stdout.slice(0, 3000) || 'No vulnerabilities found',
        };
      } else {
        // npm audit returns non-zero when vulnerabilities found, but still gives useful output
        return {
          success: true,
          packageManager: type,
          vulnerabilities: true,
          audit: (result.stdout || result.stderr).slice(0, 3000),
        };
      }
    }

    case 'hash_file': {
      const algorithm = args.algorithm || 'sha256';
      const validAlgos = ['md5', 'sha1', 'sha256', 'sha512'];
      
      if (!validAlgos.includes(algorithm)) {
        return { error: `Invalid algorithm. Use: ${validAlgos.join(', ')}` };
      }

      try {
        const content = await readFile(resolve(args.path));
        const hash = createHash(algorithm).update(content).digest('hex');
        return {
          success: true,
          file: args.path,
          algorithm,
          hash,
        };
      } catch (error) {
        return { error: error.message };
      }
    }

    case 'hash_text': {
      const algorithm = args.algorithm || 'sha256';
      const validAlgos = ['md5', 'sha1', 'sha256', 'sha512'];
      
      if (!validAlgos.includes(algorithm)) {
        return { error: `Invalid algorithm. Use: ${validAlgos.join(', ')}` };
      }

      const hash = createHash(algorithm).update(args.text).digest('hex');
      return {
        success: true,
        algorithm,
        hash,
      };
    }

    case 'check_permissions': {
      try {
        const result = await runCommand('ls', ['-la', args.path]);
        if (!result.success) {
          return { error: result.stderr || 'Failed to check permissions' };
        }

        const warnings = [];
        // Check for world-writable
        if (result.stdout.includes('-rw-rw-rw-') || result.stdout.includes('-rwxrwxrwx')) {
          warnings.push('World-writable permissions detected (security risk)');
        }
        // Check for SUID/SGID
        if (result.stdout.includes('s')) {
          warnings.push('SUID/SGID bit set');
        }

        return {
          success: true,
          permissions: result.stdout,
          warnings: warnings.length > 0 ? warnings : ['No security issues found'],
        };
      } catch (error) {
        return { error: error.message };
      }
    }

    case 'scan_secrets': {
      try {
        const content = await readFile(resolve(args.path), 'utf-8');
        const findings = [];

        for (const { name, pattern } of SECRET_PATTERNS) {
          const matches = content.match(pattern);
          if (matches) {
            findings.push({
              type: name,
              count: matches.length,
              samples: matches.slice(0, 2).map(m => m.slice(0, 20) + '...'),
            });
          }
        }

        return {
          success: true,
          file: args.path,
          secretsFound: findings.length > 0,
          findings: findings.length > 0 ? findings : 'No secrets detected',
        };
      } catch (error) {
        return { error: error.message };
      }
    }

    default:
      return { error: `Unknown security tool: ${name}` };
  }
}

export default { definitions, execute };

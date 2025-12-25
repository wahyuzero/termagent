import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { glob } from 'glob';
import { spawn } from 'child_process';

/**
 * Code Search Tool Definitions
 */
export const definitions = [
  {
    name: 'grep_search',
    description:
      'Search for text or patterns in files. Similar to grep command. ' +
      'Use this to find code, functions, or text within the codebase.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Text or regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'File or directory to search in (default: current directory)',
        },
        filePattern: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.js")',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether search is case-sensitive (default: false)',
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 50)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'find_definition',
    description:
      'Find the definition of a function, class, or variable in the codebase. ' +
      'Searches for common declaration patterns.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the function, class, or variable to find',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (default: current directory)',
        },
        language: {
          type: 'string',
          description: 'Programming language hint (js, ts, py, etc.)',
        },
      },
      required: ['name'],
    },
  },
];

/**
 * Execute search tool
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool result
 */
export async function execute(name, args) {
  try {
    switch (name) {
      case 'grep_search':
        return await grepSearch(args);
      case 'find_definition':
        return await findDefinition(args);
      default:
        return { error: `Unknown search tool: ${name}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Search for pattern in files
 */
async function grepSearch({
  pattern,
  path: searchPath,
  filePattern,
  caseSensitive = false,
  maxResults = 50,
}) {
  const basePath = resolve(searchPath || '.');

  // Find files to search
  const globPattern = filePattern || '**/*';
  const files = await glob(globPattern, {
    cwd: basePath,
    nodir: true,
    ignore: ['node_modules/**', '.git/**', '*.min.js', '*.map'],
    absolute: true,
  });

  const results = [];
  const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

  for (const file of files) {
    if (results.length >= maxResults) break;

    try {
      const content = await readFile(file, 'utf-8');

      // Skip binary files
      if (content.includes('\0')) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push({
            file: file.replace(basePath + '/', ''),
            line: i + 1,
            content: lines[i].trim().substring(0, 200),
          });

          if (results.length >= maxResults) break;
        }
        regex.lastIndex = 0; // Reset for next line
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return {
    success: true,
    pattern,
    searchPath: basePath,
    results,
    total: results.length,
    truncated: results.length >= maxResults,
  };
}

/**
 * Find definition of a symbol
 */
async function findDefinition({ name, path: searchPath, language }) {
  const basePath = resolve(searchPath || '.');

  // Determine file patterns based on language
  let filePatterns;
  switch (language) {
    case 'js':
    case 'javascript':
      filePatterns = ['**/*.js', '**/*.jsx', '**/*.mjs'];
      break;
    case 'ts':
    case 'typescript':
      filePatterns = ['**/*.ts', '**/*.tsx'];
      break;
    case 'py':
    case 'python':
      filePatterns = ['**/*.py'];
      break;
    default:
      filePatterns = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.py'];
  }

  // Common definition patterns
  const patterns = [
    // JavaScript/TypeScript
    new RegExp(`(?:function|const|let|var|class)\\s+${name}\\b`, 'i'),
    new RegExp(`${name}\\s*[:=]\\s*(?:function|async|\\()`, 'i'),
    new RegExp(`(?:export\\s+)?(?:default\\s+)?(?:function|class)\\s+${name}\\b`, 'i'),
    // Python
    new RegExp(`(?:def|class)\\s+${name}\\s*[\\(:]`, 'i'),
    // Assignment
    new RegExp(`^\\s*${name}\\s*=`, 'i'),
  ];

  const results = [];

  for (const pattern of filePatterns) {
    const files = await glob(pattern, {
      cwd: basePath,
      nodir: true,
      ignore: ['node_modules/**', '.git/**'],
      absolute: true,
    });

    for (const file of files) {
      if (results.length >= 10) break;

      try {
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const regex of patterns) {
            if (regex.test(line)) {
              // Get context (surrounding lines)
              const startLine = Math.max(0, i - 2);
              const endLine = Math.min(lines.length, i + 5);
              const context = lines.slice(startLine, endLine).join('\n');

              results.push({
                file: file.replace(basePath + '/', ''),
                line: i + 1,
                match: line.trim(),
                context: context,
                type: detectDefinitionType(line),
              });
              break;
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return {
    success: true,
    name,
    searchPath: basePath,
    definitions: results,
  };
}

/**
 * Detect type of definition
 */
function detectDefinitionType(line) {
  const trimmed = line.trim().toLowerCase();
  if (trimmed.includes('class ')) return 'class';
  if (trimmed.includes('function ') || trimmed.includes('=>')) return 'function';
  if (trimmed.startsWith('const ') || trimmed.startsWith('let ')) return 'variable';
  if (trimmed.startsWith('def ')) return 'function';
  return 'unknown';
}

export default { definitions, execute };

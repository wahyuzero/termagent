/**
 * Code Analysis Tools
 * Provides LSP-like functionality without full LSP dependency
 * Uses lightweight parsing for code intelligence
 */

/**
 * Tool Definitions
 */
export const definitions = [
  {
    name: 'get_diagnostics',
    description: 'Get syntax errors and warnings from code. Runs linters or syntax checkers for supported languages.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file or directory to check',
        },
        language: {
          type: 'string',
          description: 'Override language detection (js, ts, python, json)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_symbols',
    description: 'List all functions, classes, variables, and exports in a file. Useful for understanding file structure.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file',
        },
      },
      required: ['path'],
    },
  },
];

import { readFile, stat } from 'fs/promises';
import { resolve, extname } from 'path';
import { spawn } from 'child_process';

/**
 * Detect language from file extension
 */
function detectLanguage(filepath) {
  const ext = extname(filepath).toLowerCase();
  const langMap = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.json': 'json',
    '.sh': 'shell',
    '.bash': 'shell',
  };
  return langMap[ext] || 'unknown';
}

/**
 * Normalize language aliases
 */
function normalizeLanguage(lang) {
  const aliases = {
    'js': 'javascript',
    'javascript': 'javascript',
    'ts': 'typescript',
    'typescript': 'typescript',
    'py': 'python',
    'python': 'python',
    'json': 'json',
    'sh': 'shell',
    'bash': 'shell',
  };
  return aliases[lang?.toLowerCase()] || lang;
}

/**
 * Run command and capture output
 */
function runCommand(cmd, args = []) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { timeout: 10000 });
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => { stdout += data; });
    proc.stderr?.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', () => {
      resolve({ code: 1, stdout: '', stderr: 'Command not found' });
    });
  });
}

/**
 * Get diagnostics for JavaScript/TypeScript
 */
async function getJsDiagnostics(filepath) {
  // Try node --check first
  const result = await runCommand('node', ['--check', filepath]);
  
  const diagnostics = [];
  
  if (result.code !== 0 && result.stderr) {
    // Parse node syntax errors
    const lines = result.stderr.split('\n');
    for (const line of lines) {
      if (line.includes('SyntaxError') || line.includes('Error')) {
        diagnostics.push({
          severity: 'error',
          message: line.trim(),
          source: 'node',
        });
      }
    }
  }
  
  // Also check with JSON.parse if .json
  if (filepath.endsWith('.json')) {
    try {
      const content = await readFile(filepath, 'utf-8');
      JSON.parse(content);
    } catch (e) {
      diagnostics.push({
        severity: 'error',
        message: e.message,
        source: 'json',
      });
    }
  }
  
  return diagnostics;
}

/**
 * Get diagnostics for Python
 */
async function getPythonDiagnostics(filepath) {
  const result = await runCommand('python3', ['-m', 'py_compile', filepath]);
  
  const diagnostics = [];
  
  if (result.code !== 0 && result.stderr) {
    diagnostics.push({
      severity: 'error',
      message: result.stderr.trim(),
      source: 'python',
    });
  }
  
  return diagnostics;
}

/**
 * Extract symbols from JavaScript/TypeScript
 */
async function extractJsSymbols(content) {
  const symbols = [];
  const lines = content.split('\n');
  
  // Function patterns
  const patterns = [
    // function declarations
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, type: 'function' },
    // arrow functions assigned to const/let/var
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/m, type: 'function' },
    // class declarations
    { regex: /^(?:export\s+)?class\s+(\w+)/m, type: 'class' },
    // const/let/var (simple)
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/m, type: 'variable' },
    // export default
    { regex: /^export\s+default\s+/m, type: 'export' },
    // named exports
    { regex: /^export\s+\{\s*([^}]+)\s*\}/m, type: 'export' },
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const { regex, type } of patterns) {
      const match = line.match(regex);
      if (match) {
        symbols.push({
          name: match[1] || match[0].slice(0, 50),
          type,
          line: i + 1,
        });
        break;
      }
    }
  }
  
  return symbols;
}

/**
 * Extract symbols from Python
 */
async function extractPythonSymbols(content) {
  const symbols = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Function
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], type: 'function', line: i + 1 });
      continue;
    }
    
    // Class
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], type: 'class', line: i + 1 });
      continue;
    }
    
    // Top-level variable (starts at column 0, has =)
    const varMatch = line.match(/^(\w+)\s*=/);
    if (varMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
      symbols.push({ name: varMatch[1], type: 'variable', line: i + 1 });
    }
  }
  
  return symbols;
}

/**
 * Get diagnostics
 */
async function getDiagnostics({ path: filepath, language }) {
  const absolutePath = resolve(filepath);
  // Normalize language aliases (js→javascript, py→python, etc)
  const detectedLang = detectLanguage(absolutePath);
  const lang = language ? normalizeLanguage(language) : detectedLang;
  
  let diagnostics = [];
  
  switch (lang) {
    case 'javascript':
    case 'typescript':
      diagnostics = await getJsDiagnostics(absolutePath);
      break;
    case 'python':
      diagnostics = await getPythonDiagnostics(absolutePath);
      break;
    case 'json':
      diagnostics = await getJsDiagnostics(absolutePath);
      break;
    default:
      return {
        success: true,
        path: absolutePath,
        language: lang,
        diagnostics: [],
        message: `No diagnostics available for ${lang}`,
      };
  }
  
  return {
    success: true,
    path: absolutePath,
    language: lang,
    diagnostics,
    hasErrors: diagnostics.some(d => d.severity === 'error'),
    count: diagnostics.length,
  };
}

/**
 * Get symbols
 */
async function getSymbols({ path: filepath }) {
  const absolutePath = resolve(filepath);
  const content = await readFile(absolutePath, 'utf-8');
  const lang = detectLanguage(absolutePath);
  
  let symbols = [];
  
  switch (lang) {
    case 'javascript':
    case 'typescript':
      symbols = await extractJsSymbols(content);
      break;
    case 'python':
      symbols = await extractPythonSymbols(content);
      break;
    default:
      return {
        success: true,
        path: absolutePath,
        symbols: [],
        message: `No symbol extraction for ${lang}`,
      };
  }
  
  // Group by type
  const grouped = {
    functions: symbols.filter(s => s.type === 'function'),
    classes: symbols.filter(s => s.type === 'class'),
    variables: symbols.filter(s => s.type === 'variable'),
    exports: symbols.filter(s => s.type === 'export'),
  };
  
  return {
    success: true,
    path: absolutePath,
    language: lang,
    symbols: grouped,
    total: symbols.length,
  };
}

/**
 * Execute tool
 */
export async function execute(name, args) {
  switch (name) {
    case 'get_diagnostics':
      return await getDiagnostics(args);
    case 'get_symbols':
      return await getSymbols(args);
    default:
      return { error: `Unknown LSP tool: ${name}` };
  }
}

export default { definitions, execute };

import { readFile, readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

/**
 * Project context detector for auto-including relevant files
 */

const PROJECT_MARKERS = {
  node: ['package.json', 'node_modules', 'tsconfig.json'],
  python: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', '.venv', 'venv'],
  rust: ['Cargo.toml', 'Cargo.lock'],
  go: ['go.mod', 'go.sum'],
  java: ['pom.xml', 'build.gradle', 'gradlew'],
  ruby: ['Gemfile', 'Gemfile.lock'],
  php: ['composer.json', 'composer.lock'],
  dotnet: ['*.csproj', '*.sln', 'appsettings.json'],
};

const IMPORTANT_FILES = {
  node: ['package.json', 'tsconfig.json', '.env.example', 'README.md'],
  python: ['requirements.txt', 'pyproject.toml', 'setup.py', 'README.md'],
  rust: ['Cargo.toml', 'README.md'],
  go: ['go.mod', 'README.md'],
  java: ['pom.xml', 'build.gradle', 'README.md'],
  ruby: ['Gemfile', 'README.md'],
  php: ['composer.json', 'README.md'],
  dotnet: ['*.csproj', 'appsettings.json', 'README.md'],
  default: ['README.md', '.gitignore'],
};

/**
 * Detect project type from current directory
 * @param {string} dir - Directory to scan
 * @returns {Promise<string>} - Project type
 */
export async function detectProjectType(dir = process.cwd()) {
  try {
    const files = await readdir(dir);
    
    for (const [type, markers] of Object.entries(PROJECT_MARKERS)) {
      for (const marker of markers) {
        if (marker.includes('*')) {
          const pattern = marker.replace('*', '');
          if (files.some(f => f.endsWith(pattern))) {
            return type;
          }
        } else if (files.includes(marker)) {
          return type;
        }
      }
    }
    
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get important files for context
 * @param {string} dir - Directory to scan
 * @returns {Promise<Array>} - Array of file info
 */
export async function getContextFiles(dir = process.cwd()) {
  const projectType = await detectProjectType(dir);
  const importantFiles = [
    ...(IMPORTANT_FILES[projectType] || []),
    ...IMPORTANT_FILES.default,
  ];
  
  const context = [];
  
  for (const pattern of [...new Set(importantFiles)]) {
    try {
      const files = await readdir(dir);
      
      for (const file of files) {
        const matches = pattern.includes('*') 
          ? file.endsWith(pattern.replace('*', ''))
          : file === pattern;
          
        if (matches && existsSync(join(dir, file))) {
          const filepath = join(dir, file);
          const stats = await stat(filepath);
          
          if (stats.isFile() && stats.size < 50000) { // Max 50KB
            const content = await readFile(filepath, 'utf-8');
            context.push({
              file,
              path: filepath,
              content: content.slice(0, 2000), // First 2000 chars
              size: stats.size,
            });
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  return context;
}

/**
 * Build context summary for system prompt
 * @param {string} dir - Directory to scan
 * @returns {Promise<string>} - Context summary
 */
export async function buildContextSummary(dir = process.cwd()) {
  const projectType = await detectProjectType(dir);
  const contextFiles = await getContextFiles(dir);
  
  let summary = `\n## Project Context\n`;
  summary += `- Type: ${projectType}\n`;
  summary += `- Directory: ${dir}\n`;
  
  if (contextFiles.length > 0) {
    summary += `\n### Key Files:\n`;
    for (const file of contextFiles) {
      summary += `\n#### ${file.file}\n`;
      summary += '```\n' + file.content + '\n```\n';
    }
  }
  
  return summary;
}

/**
 * Get project info as object
 */
export async function getProjectInfo(dir = process.cwd()) {
  const type = await detectProjectType(dir);
  const files = await getContextFiles(dir);
  
  return {
    type,
    directory: dir,
    files: files.map(f => ({
      name: f.file,
      size: f.size,
    })),
  };
}

export default {
  detectProjectType,
  getContextFiles,
  buildContextSummary,
  getProjectInfo,
};

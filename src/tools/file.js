import { readFile, writeFile, mkdir, readdir, stat, unlink, rename } from 'fs/promises';
import { dirname, join, resolve, relative } from 'path';
import { glob } from 'glob';
import { diffLines } from 'diff';
import fileCache from '../utils/cache.js';

// Try to import undo manager (optional)
let getUndoManager = null;
try {
  const undo = await import('../utils/undo.js');
  getUndoManager = undo.getUndoManager;
} catch {
  // Undo not available
}

/**
 * Backup file before modification
 */
async function backupFile(filepath, operation) {
  if (getUndoManager) {
    try {
      await getUndoManager().backup(filepath, operation);
    } catch {
      // Ignore backup errors
    }
  }
}

/**
 * File Operations Tool Definitions
 */
export const definitions = [
  {
    name: 'read_file',
    description:
      'Read the contents of a file. Use this to examine file contents before making changes.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to read',
        },
        startLine: {
          type: 'integer',
          description: 'Optional start line (1-indexed) to read from',
        },
        endLine: {
          type: 'integer',
          description: 'Optional end line (1-indexed) to read to',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Create a new file or completely overwrite an existing file with new content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to write',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Edit a file by replacing specific content. Provide the exact text to find and the replacement text.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to edit',
        },
        search: {
          type: 'string',
          description: 'Exact text to search for (must match exactly)',
        },
        replace: {
          type: 'string',
          description: 'Text to replace the search text with',
        },
      },
      required: ['path', 'search', 'replace'],
    },
  },
  {
    name: 'list_directory',
    description: 'List the contents of a directory with file information.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory to list',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively (default: false)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'find_files',
    description: 'Find files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files (e.g., "**/*.js")',
        },
        cwd: {
          type: 'string',
          description: 'Directory to search in (default: current directory)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to delete',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'rename_file',
    description: 'Rename or move a file.',
    parameters: {
      type: 'object',
      properties: {
        oldPath: {
          type: 'string',
          description: 'Current path of the file',
        },
        newPath: {
          type: 'string',
          description: 'New path for the file',
        },
      },
      required: ['oldPath', 'newPath'],
    },
  },
];

/**
 * Execute file tool
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool result
 */
export async function execute(name, args) {
  try {
    switch (name) {
      case 'read_file':
        return await readFileOp(args);
      case 'write_file':
        return await writeFileOp(args);
      case 'edit_file':
        return await editFileOp(args);
      case 'list_directory':
        return await listDirectoryOp(args);
      case 'find_files':
        return await findFilesOp(args);
      case 'delete_file':
        return await deleteFileOp(args);
      case 'rename_file':
        return await renameFileOp(args);
      default:
        return { error: `Unknown file tool: ${name}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

// Tool Implementations

async function readFileOp({ path: filePath, startLine, endLine }) {
  const absolutePath = resolve(filePath);
  
  // Check cache first (only for full reads without line range)
  let content;
  if (!startLine && !endLine) {
    content = fileCache.get(absolutePath);
  }
  
  // Read from disk if not cached
  if (!content) {
    content = await readFile(absolutePath, 'utf-8');
    // Cache full content for future reads
    fileCache.set(absolutePath, content);
  }

  if (startLine || endLine) {
    const lines = content.split('\n');
    const start = (startLine || 1) - 1;
    const end = endLine || lines.length;
    const selectedLines = lines.slice(start, end);
    return {
      success: true,
      path: absolutePath,
      content: selectedLines.join('\n'),
      totalLines: lines.length,
      linesShown: `${start + 1}-${Math.min(end, lines.length)}`,
    };
  }

  const lines = content.split('\n');
  return {
    success: true,
    path: absolutePath,
    content: content,
    totalLines: lines.length,
  };
}

async function writeFileOp({ path: filePath, content }) {
  const absolutePath = resolve(filePath);
  const dir = dirname(absolutePath);

  // Backup before overwrite
  await backupFile(absolutePath, 'write');

  // Ensure directory exists
  await mkdir(dir, { recursive: true });
  await writeFile(absolutePath, content, 'utf-8');
  
  // Update cache with new content
  fileCache.set(absolutePath, content);

  const lines = content.split('\n').length;
  return {
    success: true,
    path: absolutePath,
    message: `Created file with ${lines} lines`,
  };
}

async function editFileOp({ path: filePath, search, replace }) {
  const absolutePath = resolve(filePath);
  const content = await readFile(absolutePath, 'utf-8');

  if (!content.includes(search)) {
    return {
      success: false,
      error: 'Search text not found in file',
      hint: 'Make sure the search text matches exactly, including whitespace',
    };
  }

  // Backup before edit
  await backupFile(absolutePath, 'edit');

  const newContent = content.replace(search, replace);

  // Create diff for display
  const changes = diffLines(content, newContent);
  const diffSummary = changes
    .filter((c) => c.added || c.removed)
    .map((c) => (c.added ? `+ ${c.value.trim()}` : `- ${c.value.trim()}`))
    .slice(0, 10)
    .join('\n');

  await writeFile(absolutePath, newContent, 'utf-8');

  return {
    success: true,
    path: absolutePath,
    message: 'File edited successfully',
    diff: diffSummary,
  };
}

async function listDirectoryOp({ path: dirPath, recursive = false, limit = 50, offset = 0 }) {
  const absolutePath = resolve(dirPath || '.');
  const maxLimit = Math.min(limit, 100); // Cap at 100

  if (recursive) {
    const files = await glob('**/*', {
      cwd: absolutePath,
      nodir: false,
      dot: true,
      ignore: ['node_modules/**', '.git/**', '.termagent/**'],
    });

    const paged = files.slice(offset, offset + maxLimit);
    return {
      success: true,
      path: absolutePath,
      entries: paged,
      total: files.length,
      offset,
      limit: maxLimit,
      hasMore: offset + maxLimit < files.length,
    };
  }

  const entries = await readdir(absolutePath);
  const total = entries.length;
  
  // Apply pagination
  const pagedEntries = entries.slice(offset, offset + maxLimit);
  
  // Process in batches for better memory usage
  const batchSize = 20;
  const detailed = [];
  
  for (let i = 0; i < pagedEntries.length; i += batchSize) {
    const batch = pagedEntries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (entry) => {
        const fullPath = join(absolutePath, entry);
        try {
          const stats = await stat(fullPath);
          return {
            name: entry,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.isFile() ? stats.size : undefined,
          };
        } catch {
          return { name: entry, type: 'unknown' };
        }
      })
    );
    detailed.push(...batchResults);
  }

  return {
    success: true,
    path: absolutePath,
    entries: detailed,
    total,
    offset,
    limit: maxLimit,
    hasMore: offset + maxLimit < total,
  };
}

async function findFilesOp({ pattern, cwd }) {
  const searchDir = cwd ? resolve(cwd) : process.cwd();

  const files = await glob(pattern, {
    cwd: searchDir,
    nodir: true,
    ignore: ['node_modules/**', '.git/**'],
  });

  return {
    success: true,
    pattern,
    cwd: searchDir,
    files: files.slice(0, 50),
    total: files.length,
    truncated: files.length > 50,
  };
}

async function deleteFileOp({ path: filePath }) {
  const absolutePath = resolve(filePath);
  
  // Backup before delete
  await backupFile(absolutePath, 'delete');
  
  await unlink(absolutePath);

  return {
    success: true,
    path: absolutePath,
    message: 'File deleted',
  };
}

async function renameFileOp({ oldPath, newPath }) {
  const absoluteOld = resolve(oldPath);
  const absoluteNew = resolve(newPath);

  // Ensure new directory exists
  await mkdir(dirname(absoluteNew), { recursive: true });
  await rename(absoluteOld, absoluteNew);

  return {
    success: true,
    oldPath: absoluteOld,
    newPath: absoluteNew,
    message: 'File renamed/moved',
  };
}

export default { definitions, execute };

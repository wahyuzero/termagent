import { readFile, writeFile, mkdir, readdir, unlink, copyFile } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { existsSync } from 'fs';
import config from '../config/index.js';

const MAX_BACKUPS = 20;

/**
 * Undo system for file changes
 */
class UndoManager {
  constructor() {
    this.backupDir = join(config.getConfigDir(), 'backups');
    this.historyFile = join(this.backupDir, 'history.json');
    this.history = [];
  }

  /**
   * Initialize backup directory
   */
  async init() {
    await mkdir(this.backupDir, { recursive: true });
    await this.loadHistory();
  }

  /**
   * Load history from file
   */
  async loadHistory() {
    try {
      const content = await readFile(this.historyFile, 'utf-8');
      this.history = JSON.parse(content);
    } catch {
      this.history = [];
    }
  }

  /**
   * Save history to file
   */
  async saveHistory() {
    await writeFile(this.historyFile, JSON.stringify(this.history, null, 2));
  }

  /**
   * Backup a file before modification
   * @param {string} filepath - Path to file
   * @param {string} operation - Type of operation (write, edit, delete)
   * @returns {string} - Backup ID
   */
  async backup(filepath, operation) {
    await this.init();

    const backupId = `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const backupPath = join(this.backupDir, backupId);

    // Read original content if file exists
    let originalContent = null;
    let existed = false;
    
    if (existsSync(filepath)) {
      try {
        originalContent = await readFile(filepath, 'utf-8');
        existed = true;
      } catch {
        // Binary files or unreadable
        await copyFile(filepath, backupPath + '.bin');
      }
    }

    const entry = {
      id: backupId,
      filepath,
      operation,
      timestamp: new Date().toISOString(),
      existed,
      hasContent: originalContent !== null,
    };

    if (originalContent !== null) {
      await writeFile(backupPath + '.txt', originalContent);
    }

    // Add to history
    this.history.unshift(entry);

    // Cleanup old backups
    if (this.history.length > MAX_BACKUPS) {
      const old = this.history.splice(MAX_BACKUPS);
      for (const item of old) {
        try {
          await unlink(join(this.backupDir, item.id + '.txt'));
          await unlink(join(this.backupDir, item.id + '.bin'));
        } catch {}
      }
    }

    await this.saveHistory();
    return backupId;
  }

  /**
   * Undo the last change
   * @returns {Object|null} - Undo result
   */
  async undo() {
    await this.loadHistory();

    if (this.history.length === 0) {
      return { success: false, error: 'No changes to undo' };
    }

    const last = this.history.shift();
    const backupPath = join(this.backupDir, last.id);

    try {
      if (last.operation === 'delete') {
        // File was deleted - restore it
        if (last.hasContent) {
          const content = await readFile(backupPath + '.txt', 'utf-8');
          await mkdir(dirname(last.filepath), { recursive: true });
          await writeFile(last.filepath, content);
        }
      } else if (last.existed) {
        // File existed before - restore original content
        if (last.hasContent) {
          const content = await readFile(backupPath + '.txt', 'utf-8');
          await writeFile(last.filepath, content);
        }
      } else {
        // File didn't exist - delete it
        try {
          await unlink(last.filepath);
        } catch {}
      }

      // Cleanup backup file
      try {
        await unlink(backupPath + '.txt');
        await unlink(backupPath + '.bin');
      } catch {}

      await this.saveHistory();

      return {
        success: true,
        filepath: last.filepath,
        operation: last.operation,
        message: `Restored ${basename(last.filepath)}`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get recent changes
   * @param {number} count - Number of changes to return
   * @returns {Array}
   */
  async getRecentChanges(count = 10) {
    await this.loadHistory();
    return this.history.slice(0, count).map((item) => ({
      id: item.id,
      file: item.filepath,
      operation: item.operation,
      time: item.timestamp,
    }));
  }
}

// Singleton
let undoManager = null;

export function getUndoManager() {
  if (!undoManager) {
    undoManager = new UndoManager();
  }
  return undoManager;
}

export default { getUndoManager };

import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join, basename } from 'path';
import config from '../config/index.js';

const MAX_HISTORY_MESSAGES = 100;
const SESSION_FILE = 'current_session.json';
const MAX_SESSIONS = 10;

/**
 * Conversation manager for storing and retrieving chat history
 */
export class ConversationManager {
  constructor(sessionId = null) {
    this.sessionId = sessionId || `session_${Date.now()}`;
    this.messages = [];
    this.metadata = {
      sessionId: this.sessionId,
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      provider: null,
      model: null,
      workingDirectory: process.cwd(),
    };
  }

  /**
   * Add a message to the conversation
   */
  addMessage(role, content, metadata = {}) {
    const message = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    this.messages.push(message);
    this.metadata.lastUpdated = new Date().toISOString();

    // Trim if too long
    if (this.messages.length > MAX_HISTORY_MESSAGES) {
      const systemMsg = this.messages.find((m) => m.role === 'system');
      this.messages = systemMsg
        ? [systemMsg, ...this.messages.slice(-MAX_HISTORY_MESSAGES + 1)]
        : this.messages.slice(-MAX_HISTORY_MESSAGES);
    }

    return message;
  }

  /**
   * Add a tool result message
   */
  addToolResult(toolCallId, toolName, result) {
    return this.addMessage('tool', typeof result === 'string' ? result : JSON.stringify(result), {
      tool_call_id: toolCallId,
      name: toolName,
    });
  }

  /**
   * Add assistant message with potential tool calls
   */
  addAssistantMessage(content, toolCalls = null) {
    const message = {
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
    };

    if (toolCalls && toolCalls.length > 0) {
      message.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
        },
      }));
    }

    this.messages.push(message);
    this.metadata.lastUpdated = new Date().toISOString();
    return message;
  }

  /**
   * Get messages formatted for AI provider
   */
  getMessages() {
    return this.messages.map((msg) => {
      const formatted = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.tool_call_id) {
        formatted.tool_call_id = msg.tool_call_id;
        formatted.name = msg.name;
      }

      if (msg.tool_calls) {
        formatted.tool_calls = msg.tool_calls;
      }

      return formatted;
    });
  }

  /**
   * Get the last N messages
   */
  getLastMessages(n) {
    return this.messages.slice(-n);
  }

  /**
   * Get user messages only (for display)
   */
  getUserMessages() {
    return this.messages.filter((m) => m.role === 'user');
  }

  /**
   * Clear all messages except system
   */
  clear() {
    const systemMsg = this.messages.find((m) => m.role === 'system');
    this.messages = systemMsg ? [systemMsg] : [];
  }

  /**
   * Set system message
   */
  setSystemMessage(content) {
    const existing = this.messages.findIndex((m) => m.role === 'system');
    const message = {
      role: 'system',
      content,
      timestamp: new Date().toISOString(),
    };

    if (existing >= 0) {
      this.messages[existing] = message;
    } else {
      this.messages.unshift(message);
    }
  }

  /**
   * Set metadata
   */
  setMetadata(metadata) {
    this.metadata = { ...this.metadata, ...metadata };
  }

  /**
   * Save conversation to file (auto-save current session)
   */
  async save() {
    const configDir = config.getConfigDir();
    const historyDir = join(configDir, 'sessions');

    await mkdir(historyDir, { recursive: true });

    // Save current session
    const filepath = join(historyDir, SESSION_FILE);
    await writeFile(
      filepath,
      JSON.stringify(
        {
          metadata: this.metadata,
          messages: this.messages,
        },
        null,
        2
      )
    );

    // Also save as timestamped backup
    const backupName = `${this.sessionId}.json`;
    const backupPath = join(historyDir, backupName);
    await writeFile(
      backupPath,
      JSON.stringify(
        {
          metadata: this.metadata,
          messages: this.messages,
        },
        null,
        2
      )
    );

    // Cleanup old sessions (keep only MAX_SESSIONS)
    await this.cleanupOldSessions(historyDir);

    return filepath;
  }

  /**
   * Cleanup old session files
   */
  async cleanupOldSessions(historyDir) {
    try {
      const files = await readdir(historyDir);
      const sessionFiles = files
        .filter((f) => f.startsWith('session_') && f.endsWith('.json'))
        .map((f) => ({
          name: f,
          path: join(historyDir, f),
        }));

      if (sessionFiles.length <= MAX_SESSIONS) return;

      // Get file stats and sort by mtime
      const withStats = await Promise.all(
        sessionFiles.map(async (f) => {
          const stats = await stat(f.path);
          return { ...f, mtime: stats.mtime };
        })
      );

      withStats.sort((a, b) => b.mtime - a.mtime);

      // Delete oldest sessions
      const toDelete = withStats.slice(MAX_SESSIONS);
      for (const file of toDelete) {
        await unlink(file.path);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Load conversation from file
   */
  async load(filepath) {
    const content = await readFile(filepath, 'utf-8');
    const data = JSON.parse(content);

    this.metadata = data.metadata || {};
    this.messages = data.messages || [];
    this.sessionId = this.metadata.sessionId || this.sessionId;
  }

  /**
   * Get message count
   */
  get length() {
    return this.messages.length;
  }

  /**
   * Get summary of conversation for display
   */
  getSummary() {
    const userMessages = this.messages.filter((m) => m.role === 'user').length;
    const assistantMessages = this.messages.filter((m) => m.role === 'assistant').length;
    const toolCalls = this.messages.filter((m) => m.role === 'tool').length;

    return {
      sessionId: this.sessionId,
      total: this.messages.length,
      userMessages,
      assistantMessages,
      toolCalls,
      startedAt: this.metadata.startedAt,
      lastUpdated: this.metadata.lastUpdated,
      workingDirectory: this.metadata.workingDirectory,
    };
  }
}

// Singleton instance for current conversation
let currentConversation = null;

/**
 * Get or create current conversation
 */
export function getConversation() {
  if (!currentConversation) {
    currentConversation = new ConversationManager();
  }
  return currentConversation;
}

/**
 * Start a new conversation
 */
export function newConversation() {
  currentConversation = new ConversationManager();
  return currentConversation;
}

/**
 * Load the last session if exists
 * @returns {Promise<ConversationManager|null>}
 */
export async function loadLastSession() {
  const configDir = config.getConfigDir();
  const sessionPath = join(configDir, 'sessions', SESSION_FILE);

  try {
    const conversation = new ConversationManager();
    await conversation.load(sessionPath);
    currentConversation = conversation;
    return conversation;
  } catch {
    return null;
  }
}

/**
 * Check if a previous session exists
 * @returns {Promise<Object|null>}
 */
export async function getLastSessionInfo() {
  const configDir = config.getConfigDir();
  const sessionPath = join(configDir, 'sessions', SESSION_FILE);

  try {
    const content = await readFile(sessionPath, 'utf-8');
    const data = JSON.parse(content);
    const userMsgs = (data.messages || []).filter((m) => m.role === 'user');
    
    return {
      sessionId: data.metadata?.sessionId,
      startedAt: data.metadata?.startedAt,
      lastUpdated: data.metadata?.lastUpdated,
      messageCount: data.messages?.length || 0,
      userMessageCount: userMsgs.length,
      lastUserMessage: userMsgs[userMsgs.length - 1]?.content?.slice(0, 50),
      workingDirectory: data.metadata?.workingDirectory,
    };
  } catch {
    return null;
  }
}

/**
 * List all saved sessions
 * @returns {Promise<Array>}
 */
export async function listSessions() {
  const configDir = config.getConfigDir();
  const historyDir = join(configDir, 'sessions');

  try {
    const files = await readdir(historyDir);
    const sessions = [];

    for (const file of files) {
      if (!file.startsWith('session_') || !file.endsWith('.json')) continue;

      const filepath = join(historyDir, file);
      try {
        const content = await readFile(filepath, 'utf-8');
        const data = JSON.parse(content);
        const userMsgs = (data.messages || []).filter((m) => m.role === 'user');

        sessions.push({
          filename: file,
          sessionId: data.metadata?.sessionId,
          startedAt: data.metadata?.startedAt,
          lastUpdated: data.metadata?.lastUpdated,
          workingDirectory: data.metadata?.workingDirectory,
          messageCount: data.messages?.length || 0,
          userMessageCount: userMsgs.length,
          preview: userMsgs[0]?.content?.slice(0, 40),
        });
      } catch {
        // Skip invalid files
      }
    }

    // Sort by lastUpdated descending
    sessions.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

    return sessions;
  } catch {
    return [];
  }
}

/**
 * Load a specific session by filename
 */
export async function loadSession(filename) {
  const configDir = config.getConfigDir();
  const filepath = join(configDir, 'sessions', filename);

  const conversation = new ConversationManager();
  await conversation.load(filepath);
  currentConversation = conversation;
  return conversation;
}

/**
 * Auto-save current conversation
 */
export async function autoSave() {
  if (currentConversation && currentConversation.messages.length > 1) {
    await currentConversation.save();
  }
}

export default {
  ConversationManager,
  getConversation,
  newConversation,
  loadLastSession,
  getLastSessionInfo,
  listSessions,
  loadSession,
  autoSave,
};

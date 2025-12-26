import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join, basename } from 'path';
import config from '../config/index.js';
import { logMessages, analyzeMessages } from '../utils/debug.js';

const MAX_HISTORY_MESSAGES = 100;
const SESSION_FILE = 'current_session.json';
const MAX_SESSIONS = 10;

// Token management constants - more aggressive for API compatibility
const MAX_CONTEXT_TOKENS = 8000;    // Lower limit to stay safe
const TOKENS_PER_CHAR = 0.25;       // Rough estimate: 4 chars = 1 token
const KEEP_RECENT_MESSAGES = 6;     // Keep fewer messages (3 user + 3 assistant rounds)
const TRUNCATE_TOOL_RESULTS = 500;  // Shorter tool results
const MAX_TOOL_MESSAGES = 20;       // Max tool messages to keep

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
    const hasToolCalls = toolCalls && toolCalls.length > 0;
    
    const message = {
      role: 'assistant',
      // GLM/ZAI requires null content when using tool_calls, not empty string
      // But needs content (even empty) when no tool_calls
      content: hasToolCalls ? (content || null) : (content || ''),
      timestamp: new Date().toISOString(),
    };

    if (hasToolCalls) {
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
   * Estimate token count for a message
   */
  estimateTokens(content) {
    if (!content) return 0;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    return Math.ceil(str.length * TOKENS_PER_CHAR);
  }

  /**
   * Get messages formatted for AI provider with context pruning
   * IMPORTANT: Must maintain valid tool_call chains (assistant with tool_calls → tool results)
   */
  getMessages() {
    // First pass: format all messages
    const formatted = this.messages.map((msg, idx) => {
      // GLM/ZAI specific: null content for assistant with tool_calls, else use content or empty string
      let content;
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        content = msg.content || null;  // null for assistant with tool_calls
      } else {
        content = msg.content ?? '';    // empty string for others
      }
      
      const base = {
        role: msg.role,
        content,
        _idx: idx,  // Track original index for chain detection
      };

      if (msg.tool_call_id) {
        base.tool_call_id = msg.tool_call_id;
        base.name = msg.name;
      }

      if (msg.tool_calls) {
        base.tool_calls = msg.tool_calls;
      }

      return base;
    });

    // Calculate total tokens
    let totalTokens = formatted.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);

    // If under limit, return as-is
    if (totalTokens <= MAX_CONTEXT_TOKENS && formatted.length <= 50) {
      return formatted.map(({ _idx, ...msg }) => msg);
    }

    // === AGGRESSIVE PRUNING ===
    
    // Find system message
    const systemMsg = formatted.find(m => m.role === 'system');
    
    // Count tool messages
    const toolMsgs = formatted.filter(m => m.role === 'tool');
    const assistantWithToolCalls = formatted.filter(m => m.role === 'assistant' && m.tool_calls);
    
    // If too many tool messages, keep only recent ones
    let pruned = formatted;
    
    if (toolMsgs.length > MAX_TOOL_MESSAGES) {
      // Get IDs of recent tool calls to keep
      const recentToolCallIds = new Set();
      const recentAssistants = assistantWithToolCalls.slice(-Math.ceil(MAX_TOOL_MESSAGES / 3));
      
      for (const asst of recentAssistants) {
        if (asst.tool_calls) {
          for (const tc of asst.tool_calls) {
            recentToolCallIds.add(tc.id);
          }
        }
      }
      
      // Filter: keep system, user messages, recent assistants, and matching tool results
      pruned = formatted.filter(msg => {
        if (msg.role === 'system') return true;
        if (msg.role === 'user') return true;
        if (msg.role === 'assistant' && !msg.tool_calls) return true;
        if (msg.role === 'assistant' && msg.tool_calls) {
          // Keep if any tool call is in recent set
          return msg.tool_calls.some(tc => recentToolCallIds.has(tc.id));
        }
        if (msg.role === 'tool') {
          return recentToolCallIds.has(msg.tool_call_id);
        }
        return true;
      });
    }
    
    // Truncate remaining tool results if needed
    pruned = pruned.map(msg => {
      if (msg.role === 'tool' && msg.content && msg.content.length > TRUNCATE_TOOL_RESULTS) {
        return {
          ...msg,
          content: msg.content.slice(0, TRUNCATE_TOOL_RESULTS) + '\n...[truncated]',
        };
      }
      return msg;
    });

    // Recalculate tokens
    totalTokens = pruned.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);

    // If still over limit, keep only system + last N messages
    if (totalTokens > MAX_CONTEXT_TOKENS) {
      const minimal = [
        systemMsg,
        ...pruned.filter(m => m.role !== 'system').slice(-KEEP_RECENT_MESSAGES)
      ].filter(Boolean);
      
      const result = minimal.map(({ _idx, ...msg }) => msg);
      // Debug log
      logMessages(result, 'getMessages_minimal').catch(() => {});
      return result;
    }

    const result = pruned.map(({ _idx, ...msg }) => msg);
    // Debug log - only log if there are potential issues
    const analysis = analyzeMessages(result);
    if (!analysis.isValid || result.length > 40) {
      logMessages(result, 'getMessages_pruned').catch(() => {});
    }
    return result;
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
 * Get messages from current conversation
 */
export function getMessages() {
  return getConversation().messages;
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

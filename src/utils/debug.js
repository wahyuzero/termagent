/**
 * Debug Logger for Message Issues
 * Logs conversation state to help diagnose 400 errors
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const DEBUG_DIR = join(homedir(), '.termagent', 'debug');
let debugEnabled = true;

/**
 * Enable/disable debug logging
 */
export function setDebugEnabled(enabled) {
  debugEnabled = enabled;
}

/**
 * Log messages to debug file
 */
export async function logMessages(messages, label = 'messages') {
  if (!debugEnabled) return;
  
  try {
    await mkdir(DEBUG_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${label}_${timestamp}.json`;
    const filepath = join(DEBUG_DIR, filename);
    
    // Analyze messages
    const analysis = analyzeMessages(messages);
    
    const logData = {
      timestamp: new Date().toISOString(),
      label,
      analysis,
      messageCount: messages.length,
      messages: messages.map((m, i) => ({
        index: i,
        role: m.role,
        contentLength: m.content?.length || 0,
        hasToolCalls: !!m.tool_calls,
        toolCallIds: m.tool_calls?.map(tc => tc.id) || null,
        toolCallId: m.tool_call_id || null,
        toolName: m.name || null,
      })),
      // Include first 50 chars of each message content for context
      contentPreviews: messages.map((m, i) => ({
        index: i,
        role: m.role,
        preview: (m.content || '').slice(0, 100),
      })),
    };
    
    await writeFile(filepath, JSON.stringify(logData, null, 2));
    
    // Also log to console if there are issues
    if (!analysis.isValid) {
      console.error('\n⚠️  DEBUG: Message chain issues detected!');
      console.error(`   File: ${filepath}`);
      console.error(`   Issues: ${analysis.issues.join(', ')}`);
    }
    
    return { filepath, analysis };
  } catch (error) {
    console.error('Debug log error:', error.message);
  }
}

/**
 * Analyze messages for chain integrity
 */
export function analyzeMessages(messages) {
  const issues = [];
  const stats = {
    total: messages.length,
    system: 0,
    user: 0,
    assistant: 0,
    assistantWithToolCalls: 0,
    tool: 0,
    totalToolCalls: 0,
    totalToolResults: 0,
  };
  
  // Collect all tool_call IDs from assistant messages
  const toolCallIds = new Set();
  // Collect all tool_call_ids from tool results
  const toolResultIds = new Set();
  // Map tool_call_id to assistant message index
  const toolCallToAssistant = new Map();
  
  messages.forEach((msg, idx) => {
    if (msg.role === 'system') stats.system++;
    else if (msg.role === 'user') stats.user++;
    else if (msg.role === 'assistant') {
      stats.assistant++;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        stats.assistantWithToolCalls++;
        for (const tc of msg.tool_calls) {
          if (tc.id) {
            toolCallIds.add(tc.id);
            toolCallToAssistant.set(tc.id, idx);
            stats.totalToolCalls++;
          }
          // Check for malformed tool calls
          if (!tc.id || !tc.function?.name) {
            issues.push(`Malformed tool_call at msg[${idx}]: missing id or name`);
          }
        }
      }
    } else if (msg.role === 'tool') {
      stats.tool++;
      stats.totalToolResults++;
      if (msg.tool_call_id) {
        toolResultIds.add(msg.tool_call_id);
      } else {
        issues.push(`Tool result at msg[${idx}] missing tool_call_id`);
      }
      
      // Check for null content
      if (msg.content === null || msg.content === undefined) {
        issues.push(`Tool result at msg[${idx}] has null content`);
      }
    }
    
    // Check for null content in non-tool messages
    // Exception: assistant with tool_calls can have null content (GLM requirement)
    if (msg.role !== 'tool' && (msg.content === null || msg.content === undefined)) {
      // Skip this check for assistant with tool_calls - null is intentional
      if (!(msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0)) {
        issues.push(`Message at msg[${idx}] (${msg.role}) has null content`);
      }
    }
  });
  
  // Check chain integrity: every tool_call should have a matching tool result
  for (const tcId of toolCallIds) {
    if (!toolResultIds.has(tcId)) {
      const assistantIdx = toolCallToAssistant.get(tcId);
      issues.push(`Missing tool result for tool_call_id: ${tcId} (from assistant msg[${assistantIdx}])`);
    }
  }
  
  // Check reverse: every tool result should reference a valid tool_call
  for (const trId of toolResultIds) {
    if (!toolCallIds.has(trId)) {
      issues.push(`Orphan tool result with tool_call_id: ${trId} (no matching tool_call)`);
    }
  }
  
  // Estimate tokens
  const estimatedTokens = messages.reduce((sum, m) => {
    const content = m.content || '';
    return sum + Math.ceil(content.length * 0.25);
  }, 0);
  
  return {
    isValid: issues.length === 0,
    issues,
    stats,
    estimatedTokens,
    chainIntegrity: {
      toolCallsCount: toolCallIds.size,
      toolResultsCount: toolResultIds.size,
      unmatchedCalls: [...toolCallIds].filter(id => !toolResultIds.has(id)),
      orphanResults: [...toolResultIds].filter(id => !toolCallIds.has(id)),
    },
  };
}

/**
 * Log API error with context
 */
export async function logApiError(error, messages, provider) {
  if (!debugEnabled) return;
  
  try {
    await mkdir(DEBUG_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `error_${timestamp}.json`;
    const filepath = join(DEBUG_DIR, filename);
    
    const analysis = analyzeMessages(messages);
    
    const logData = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        status: error.status,
        code: error.code,
      },
      provider,
      analysis,
      messageCount: messages.length,
      // Full messages for debugging
      messages: messages,
    };
    
    await writeFile(filepath, JSON.stringify(logData, null, 2));
    
    console.error('\n🔴 DEBUG: API Error logged');
    console.error(`   File: ${filepath}`);
    console.error(`   Messages: ${messages.length}`);
    console.error(`   Est. Tokens: ${analysis.estimatedTokens}`);
    console.error(`   Issues: ${analysis.issues.length > 0 ? analysis.issues.join(', ') : 'None detected'}`);
    console.error(`   Tool Calls: ${analysis.stats.totalToolCalls}, Results: ${analysis.stats.totalToolResults}`);
    
    return { filepath, analysis };
  } catch (err) {
    console.error('Debug log error:', err.message);
  }
}

export default {
  setDebugEnabled,
  logMessages,
  analyzeMessages,
  logApiError,
};

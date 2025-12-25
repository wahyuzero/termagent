import { getProvider } from '../providers/index.js';
import { getToolDefinitions, executeTool } from '../tools/index.js';
import { getConversation } from '../conversation/index.js';
import { generateSystemPrompt } from './prompts.js';
import config from '../config/index.js';

/**
 * Agent Controller - Main orchestrator for AI agent interactions
 */
export class Agent {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || config.get('agent.maxIterations') || 10;
    this.confirmCommands = options.confirmCommands ?? config.get('agent.confirmCommands') ?? true;
    this.onToolCall = options.onToolCall || (() => {});
    this.onToolResult = options.onToolResult || (() => {});
    this.onContent = options.onContent || (() => {});
    this.onConfirmCommand = options.onConfirmCommand || (() => Promise.resolve(true));
  }

  /**
   * Initialize the agent with system prompt
   */
  initialize() {
    const conversation = getConversation();
    const systemPrompt = generateSystemPrompt({
      workingDirectory: process.cwd(),
    });
    conversation.setSystemMessage(systemPrompt);
    conversation.setMetadata({
      provider: config.getCurrentProvider(),
      model: config.getCurrentModel(),
    });
  }

  /**
   * Process a user message and get AI response
   * @param {string} message - User message
   * @param {Object} options - Processing options
   * @returns {AsyncGenerator} - Yields response chunks
   */
  async *chat(message, options = {}) {
    const conversation = getConversation();
    const provider = getProvider();
    const tools = getToolDefinitions();

    // Add user message
    conversation.addMessage('user', message);

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      const messages = conversation.getMessages();

      // Stream response from AI
      let content = '';
      let toolCalls = [];

      try {
        const stream = provider.stream(messages, { tools });

        for await (const chunk of stream) {
          if (chunk.type === 'content') {
            content += chunk.content;
            yield { type: 'content', content: chunk.content };
          } else if (chunk.type === 'tool_calls') {
            toolCalls = chunk.toolCalls;
          } else if (chunk.type === 'done') {
            // Stream complete
          }
        }
      } catch (error) {
        yield { type: 'error', error: error.message };
        return;
      }

      // Add assistant response to conversation
      conversation.addAssistantMessage(content, toolCalls.length > 0 ? toolCalls : null);

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        yield { type: 'done' };
        return;
      }

      // Filter out invalid tool calls (some models return malformed data)
      const validToolCalls = toolCalls.filter(tc => tc && tc.name && typeof tc.name === 'string');
      
      if (validToolCalls.length === 0) {
        yield { type: 'done' };
        return;
      }

      // Execute tool calls
      for (const toolCall of validToolCalls) {
        yield { type: 'tool_call', tool: toolCall.name, args: toolCall.arguments || {} };
        this.onToolCall(toolCall);

        try {
          const result = await executeTool(toolCall.name, toolCall.arguments || {}, {
            confirmCallback: this.confirmCommands ? this.onConfirmCommand : null,
          });

          // Add tool result to conversation
          conversation.addToolResult(toolCall.id, toolCall.name, result);

          yield { type: 'tool_result', tool: toolCall.name, result };
          this.onToolResult(toolCall.name, result);
        } catch (error) {
          const errorResult = { error: error.message };
          conversation.addToolResult(toolCall.id, toolCall.name, errorResult);
          yield { type: 'tool_result', tool: toolCall.name, result: errorResult };
        }
      }

      // Continue loop to let AI process tool results
    }

    yield { type: 'max_iterations', message: `Reached maximum iterations (${this.maxIterations})` };
  }

  /**
   * Process a user message without streaming (full response)
   * @param {string} message - User message
   * @returns {Promise<Object>} - Full response
   */
  async process(message) {
    const chunks = [];
    let content = '';
    const toolResults = [];

    for await (const chunk of this.chat(message)) {
      chunks.push(chunk);
      if (chunk.type === 'content') {
        content += chunk.content;
      } else if (chunk.type === 'tool_result') {
        toolResults.push(chunk);
      }
    }

    return {
      content,
      toolResults,
      chunks,
    };
  }

  /**
   * Get conversation summary
   * @returns {Object}
   */
  getSummary() {
    return getConversation().getSummary();
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    getConversation().clear();
    this.initialize();
  }
}

/**
 * Create and initialize an agent
 * @param {Object} options - Agent options
 * @returns {Agent}
 */
export function createAgent(options = {}) {
  const agent = new Agent(options);
  agent.initialize();
  return agent;
}

export default { Agent, createAgent };

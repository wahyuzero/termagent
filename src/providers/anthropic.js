import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.js';

/**
 * Anthropic Claude Provider
 * https://anthropic.com
 */
export class AnthropicProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'anthropic';
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  formatTools(tools) {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  async chat(messages, options = {}) {
    // Convert OpenAI format to Anthropic format
    const { system, anthropicMessages } = this.convertMessages(messages);

    const params = {
      model: this.model,
      max_tokens: options.maxTokens || 4096,
      messages: anthropicMessages,
    };

    if (system) {
      params.system = system;
    }

    if (options.tools && options.tools.length > 0) {
      params.tools = this.formatTools(options.tools);
    }

    const response = await this.client.messages.create(params);
    return this.normalizeResponse(response);
  }

  async *stream(messages, options = {}) {
    const { system, anthropicMessages } = this.convertMessages(messages);

    const params = {
      model: this.model,
      max_tokens: options.maxTokens || 4096,
      messages: anthropicMessages,
      stream: true,
    };

    if (system) {
      params.system = system;
    }

    if (options.tools && options.tools.length > 0) {
      params.tools = this.formatTools(options.tools);
    }

    const stream = await this.client.messages.stream(params);

    let accumulatedToolCalls = [];
    let currentToolInput = '';
    let currentToolId = null;
    let currentToolName = null;

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'content', content: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolId = event.content_block.id;
          currentToolName = event.content_block.name;
          currentToolInput = '';
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolId && currentToolName) {
          try {
            accumulatedToolCalls.push({
              id: currentToolId,
              name: currentToolName,
              arguments: currentToolInput ? JSON.parse(currentToolInput) : {},
            });
          } catch {
            accumulatedToolCalls.push({
              id: currentToolId,
              name: currentToolName,
              arguments: {},
            });
          }
          currentToolId = null;
          currentToolName = null;
          currentToolInput = '';
        }
      } else if (event.type === 'message_stop') {
        if (accumulatedToolCalls.length > 0) {
          yield { type: 'tool_calls', toolCalls: accumulatedToolCalls };
          accumulatedToolCalls = [];
        }
        yield { type: 'done' };
      }
    }
  }

  /**
   * Convert OpenAI message format to Anthropic format
   */
  convertMessages(messages) {
    let system = '';
    const anthropicMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system += (system ? '\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        anthropicMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.tool_calls) {
          // Assistant with tool calls
          const content = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.tool_calls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function?.name || tc.name,
              input: typeof tc.function?.arguments === 'string' 
                ? JSON.parse(tc.function.arguments) 
                : tc.arguments || {},
            });
          }
          anthropicMessages.push({ role: 'assistant', content });
        } else {
          anthropicMessages.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'tool') {
        // Tool result
        anthropicMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content,
          }],
        });
      }
    }

    return { system, anthropicMessages };
  }

  normalizeResponse(response) {
    let content = '';
    const toolCalls = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input,
        });
      }
    }

    return {
      content: content || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: response.stop_reason,
      usage: {
        prompt_tokens: response.usage?.input_tokens,
        completion_tokens: response.usage?.output_tokens,
      },
    };
  }

  parseToolCalls(response) {
    return response.toolCalls || [];
  }

  formatToolResult(toolCallId, toolName, result) {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    };
  }
}

export default AnthropicProvider;

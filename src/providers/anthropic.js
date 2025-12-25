import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.js';

/**
 * Anthropic Claude Provider Implementation
 */
export class AnthropicProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'anthropic';
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  /**
   * Format tools for Anthropic tool use
   */
  formatTools(tools) {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  /**
   * Convert messages to Anthropic format
   */
  convertMessages(messages) {
    const converted = [];
    let systemPrompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else if (msg.role === 'tool') {
        // Anthropic uses tool_result in user message
        converted.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id,
              content: msg.content,
            },
          ],
        });
      } else if (msg.role === 'assistant' && msg.tool_calls) {
        // Convert tool calls to Anthropic format
        const content = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        converted.push({ role: 'assistant', content });
      } else {
        converted.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return { messages: converted, system: systemPrompt };
  }

  /**
   * Send chat completion request
   */
  async chat(messages, options = {}) {
    const { messages: convertedMessages, system } = this.convertMessages(messages);

    const params = {
      model: this.model,
      messages: convertedMessages,
      max_tokens: options.maxTokens || 4096,
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

  /**
   * Stream chat completion
   */
  async *stream(messages, options = {}) {
    const { messages: convertedMessages, system } = this.convertMessages(messages);

    const params = {
      model: this.model,
      messages: convertedMessages,
      max_tokens: options.maxTokens || 4096,
      stream: true,
    };

    if (system) {
      params.system = system;
    }

    if (options.tools && options.tools.length > 0) {
      params.tools = this.formatTools(options.tools);
    }

    const stream = await this.client.messages.stream(params);

    let currentToolUse = null;
    let toolUses = [];

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
            arguments: '',
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield {
            type: 'content',
            content: event.delta.text,
          };
        } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
          currentToolUse.arguments += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolUse) {
          toolUses.push({
            id: currentToolUse.id,
            name: currentToolUse.name,
            arguments: JSON.parse(currentToolUse.arguments || '{}'),
          });
          currentToolUse = null;
        }
      } else if (event.type === 'message_stop') {
        if (toolUses.length > 0) {
          yield {
            type: 'tool_calls',
            toolCalls: toolUses,
          };
        }
        yield { type: 'done' };
      }
    }
  }

  /**
   * Normalize response to common format
   */
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
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  /**
   * Parse tool calls from response
   */
  parseToolCalls(response) {
    return response.toolCalls || [];
  }

  /**
   * Format tool result for next request
   */
  formatToolResult(toolCallId, _toolName, result) {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    };
  }
}

export default AnthropicProvider;

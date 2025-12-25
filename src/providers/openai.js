import OpenAI from 'openai';
import { BaseProvider } from './base.js';

/**
 * OpenAI Provider Implementation
 */
export class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'openai';
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  /**
   * Format tools for OpenAI function calling
   */
  formatTools(tools) {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Send chat completion request
   */
  async chat(messages, options = {}) {
    const params = {
      model: this.model,
      messages: messages,
      max_tokens: options.maxTokens || 4096,
    };

    if (options.tools && options.tools.length > 0) {
      params.tools = this.formatTools(options.tools);
      params.tool_choice = options.toolChoice || 'auto';
    }

    const response = await this.client.chat.completions.create(params);
    return this.normalizeResponse(response);
  }

  /**
   * Stream chat completion
   */
  async *stream(messages, options = {}) {
    const params = {
      model: this.model,
      messages: messages,
      max_tokens: options.maxTokens || 4096,
      stream: true,
    };

    if (options.tools && options.tools.length > 0) {
      params.tools = this.formatTools(options.tools);
      params.tool_choice = options.toolChoice || 'auto';
    }

    const stream = await this.client.chat.completions.create(params);

    let accumulatedToolCalls = [];
    let currentToolCall = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield {
          type: 'content',
          content: delta.content,
        };
      }

      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          if (toolCallDelta.id) {
            // New tool call starting
            if (currentToolCall) {
              accumulatedToolCalls.push(currentToolCall);
            }
            currentToolCall = {
              id: toolCallDelta.id,
              name: toolCallDelta.function?.name || '',
              arguments: toolCallDelta.function?.arguments || '',
            };
          } else if (currentToolCall) {
            // Continuing existing tool call
            if (toolCallDelta.function?.name) {
              currentToolCall.name += toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              currentToolCall.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }

      if (chunk.choices[0]?.finish_reason === 'tool_calls') {
        if (currentToolCall) {
          accumulatedToolCalls.push(currentToolCall);
        }
        yield {
          type: 'tool_calls',
          toolCalls: accumulatedToolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.arguments),
          })),
        };
      }

      if (chunk.choices[0]?.finish_reason === 'stop') {
        yield { type: 'done' };
      }
    }
  }

  /**
   * Normalize response to common format
   */
  normalizeResponse(response) {
    const choice = response.choices[0];
    const message = choice.message;

    return {
      content: message.content,
      toolCalls: message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      finishReason: choice.finish_reason,
      usage: response.usage,
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
  formatToolResult(toolCallId, toolName, result) {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    };
  }
}

export default OpenAIProvider;

import OpenAI from 'openai';
import { BaseProvider } from './base.js';

/**
 * Z.AI Provider Implementation (OpenAI-compatible API)
 * Uses GLM-4.7 and GLM-4.5-air models
 * Docs: https://docs.z.ai/devpack/tool/others
 */
export class ZAIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'zai';
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: config.baseUrl || 'https://api.z.ai/api/coding/paas/v4',
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
      const finishReason = chunk.choices[0]?.finish_reason;

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

      // Handle finish - yield any accumulated tool calls
      if (finishReason) {
        // Push last tool call if exists
        if (currentToolCall) {
          accumulatedToolCalls.push(currentToolCall);
          currentToolCall = null;
        }

        // Yield tool calls if any
        if (accumulatedToolCalls.length > 0) {
          yield {
            type: 'tool_calls',
            toolCalls: accumulatedToolCalls.map((tc) => {
              try {
                return {
                  id: tc.id,
                  name: tc.name,
                  arguments: JSON.parse(tc.arguments),
                };
              } catch {
                return {
                  id: tc.id,
                  name: tc.name,
                  arguments: {},
                };
              }
            }),
          };
          accumulatedToolCalls = [];
        }

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

export default ZAIProvider;

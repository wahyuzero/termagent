import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseProvider } from './base.js';

/**
 * Google Gemini Provider Implementation
 */
export class GoogleProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'google';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  /**
   * Format tools for Google function calling
   */
  formatTools(tools) {
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ];
  }

  /**
   * Convert messages to Gemini format
   */
  convertMessages(messages) {
    const history = [];
    let systemInstruction = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else if (msg.role === 'user') {
        history.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        const parts = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        history.push({ role: 'model', parts });
      } else if (msg.role === 'tool') {
        history.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.name,
                response: JSON.parse(msg.content),
              },
            },
          ],
        });
      }
    }

    return { history, systemInstruction };
  }

  /**
   * Send chat completion request
   */
  async chat(messages, options = {}) {
    const { history, systemInstruction } = this.convertMessages(messages);

    const modelConfig = {
      model: this.model,
    };

    if (systemInstruction) {
      modelConfig.systemInstruction = systemInstruction;
    }

    const model = this.genAI.getGenerativeModel(modelConfig);

    const generationConfig = {
      maxOutputTokens: options.maxTokens || 4096,
    };

    const chatConfig = {
      history: history.slice(0, -1),
      generationConfig,
    };

    if (options.tools && options.tools.length > 0) {
      chatConfig.tools = this.formatTools(options.tools);
    }

    const chat = model.startChat(chatConfig);
    const lastMessage = history[history.length - 1];

    const result = await chat.sendMessage(lastMessage.parts);
    return this.normalizeResponse(result.response);
  }

  /**
   * Stream chat completion
   */
  async *stream(messages, options = {}) {
    const { history, systemInstruction } = this.convertMessages(messages);

    const modelConfig = {
      model: this.model,
    };

    if (systemInstruction) {
      modelConfig.systemInstruction = systemInstruction;
    }

    const model = this.genAI.getGenerativeModel(modelConfig);

    const generationConfig = {
      maxOutputTokens: options.maxTokens || 4096,
    };

    const chatConfig = {
      history: history.slice(0, -1),
      generationConfig,
    };

    if (options.tools && options.tools.length > 0) {
      chatConfig.tools = this.formatTools(options.tools);
    }

    const chat = model.startChat(chatConfig);
    const lastMessage = history[history.length - 1];

    const result = await chat.sendMessageStream(lastMessage.parts);

    let toolCalls = [];

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield {
          type: 'content',
          content: text,
        };
      }

      // Check for function calls
      const candidates = chunk.candidates;
      if (candidates) {
        for (const candidate of candidates) {
          for (const part of candidate.content.parts) {
            if (part.functionCall) {
              toolCalls.push({
                id: `fc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                name: part.functionCall.name,
                arguments: part.functionCall.args,
              });
            }
          }
        }
      }
    }

    if (toolCalls.length > 0) {
      yield {
        type: 'tool_calls',
        toolCalls,
      };
    }

    yield { type: 'done' };
  }

  /**
   * Normalize response to common format
   */
  normalizeResponse(response) {
    let content = '';
    const toolCalls = [];

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content.parts) {
        if (part.text) {
          content += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `fc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args,
          });
        }
      }
    }

    return {
      content: content || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: candidates?.[0]?.finishReason,
      usage: response.usageMetadata,
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
  formatToolResult(_toolCallId, toolName, result) {
    return {
      role: 'tool',
      name: toolName,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    };
  }
}

export default GoogleProvider;

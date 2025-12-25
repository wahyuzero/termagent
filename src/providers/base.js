/**
 * BaseProvider - Abstract base class for AI providers
 * All provider implementations must extend this class
 */
export class BaseProvider {
  constructor(config = {}) {
    this.name = 'base';
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Get current model
   * @returns {string}
   */
  getModel() {
    return this.model;
  }

  /**
   * Set model
   * @param {string} model - Model name
   */
  setModel(model) {
    this.model = model;
  }

  /**
   * Send chat completion request
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Options including tools
   * @returns {Promise<Object>} - Response object
   */
  async chat(_messages, _options = {}) {
    throw new Error('chat() must be implemented by provider');
  }

  /**
   * Stream chat completion
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Options including tools
   * @yields {Object} - Stream chunks
   */
  async *stream(_messages, _options = {}) {
    throw new Error('stream() must be implemented by provider');
  }

  /**
   * Get tool definitions in provider-specific format
   * @param {Array} tools - Universal tool definitions
   * @returns {Array} - Provider-specific tool definitions
   */
  formatTools(_tools) {
    throw new Error('formatTools() must be implemented by provider');
  }

  /**
   * Parse tool calls from response
   * @param {Object} response - Provider response
   * @returns {Array} - Array of tool calls
   */
  parseToolCalls(_response) {
    throw new Error('parseToolCalls() must be implemented by provider');
  }

  /**
   * Format tool result for next request
   * @param {string} toolCallId - Tool call ID
   * @param {string} toolName - Tool name
   * @param {any} result - Tool execution result
   * @returns {Object} - Formatted tool result message
   */
  formatToolResult(_toolCallId, _toolName, _result) {
    throw new Error('formatToolResult() must be implemented by provider');
  }

  /**
   * Test connection to provider
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      await this.chat([{ role: 'user', content: 'Hi' }], { maxTokens: 5 });
      return true;
    } catch (error) {
      console.error(`Connection test failed: ${error.message}`);
      return false;
    }
  }
}

export default BaseProvider;

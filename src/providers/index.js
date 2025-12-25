import config from '../config/index.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import { GroqProvider } from './groq.js';
import { ZAIProvider } from './zai.js';

const providerClasses = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  google: GoogleProvider,
  groq: GroqProvider,
  zai: ZAIProvider,
};

let currentProvider = null;

/**
 * Get or create provider instance
 * @param {string} [providerName] - Provider name (uses config if not provided)
 * @param {string} [modelName] - Model name (uses config if not provided)
 * @returns {BaseProvider}
 */
export function getProvider(providerName, modelName) {
  const name = providerName || config.getCurrentProvider();
  const model = modelName || config.getCurrentModel();
  const apiKey = config.getApiKey(name);

  if (!apiKey) {
    throw new Error(
      `No API key found for provider "${name}". ` +
        `Set it via environment variable or run: termagent config`
    );
  }

  const ProviderClass = providerClasses[name];
  if (!ProviderClass) {
    throw new Error(`Unknown provider: ${name}`);
  }

  // Reuse existing provider if same config
  if (
    currentProvider &&
    currentProvider.getName() === name &&
    currentProvider.getModel() === model
  ) {
    return currentProvider;
  }

  currentProvider = new ProviderClass({
    apiKey,
    model,
  });

  return currentProvider;
}

/**
 * Switch to a different provider
 * @param {string} providerName - Provider name
 * @param {string} [modelName] - Model name
 * @returns {BaseProvider}
 */
export function switchProvider(providerName, modelName) {
  config.setProvider(providerName, modelName);
  currentProvider = null;
  return getProvider();
}

/**
 * Get list of available providers
 * @returns {string[]}
 */
export function getAvailableProviders() {
  return Object.keys(providerClasses);
}

/**
 * Check if provider has valid API key
 * @param {string} providerName - Provider name
 * @returns {boolean}
 */
export function hasApiKey(providerName) {
  return !!config.getApiKey(providerName);
}

/**
 * Get available providers with API keys
 * @returns {string[]}
 */
export function getConfiguredProviders() {
  return getAvailableProviders().filter(hasApiKey);
}

export default {
  getProvider,
  switchProvider,
  getAvailableProviders,
  hasApiKey,
  getConfiguredProviders,
};

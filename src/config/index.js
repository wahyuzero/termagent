import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';
import { defaults } from './defaults.js';

// Detect Termux environment
const isTermux = !!process.env.TERMUX_VERSION;
const homeDir = process.env.HOME || homedir();
const configDir = join(homeDir, '.termagent');

// Initialize config store
const config = new Conf({
  projectName: 'termagent',
  cwd: configDir,
  defaults: defaults,
});

/**
 * Get configuration value
 * @param {string} key - Dot notation key (e.g., 'provider' or 'providers.openai.models')
 * @returns {any}
 */
export function get(key) {
  return config.get(key);
}

/**
 * Set configuration value
 * @param {string} key - Dot notation key
 * @param {any} value - Value to set
 */
export function set(key, value) {
  config.set(key, value);
}

/**
 * Get API key for provider from env or config
 * @param {string} provider - Provider name
 * @returns {string|undefined}
 */
export function getApiKey(provider) {
  const envKeys = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    groq: 'GROQ_API_KEY',
    zai: 'ZAI_API_KEY',
  };

  // First check environment variable
  const envKey = process.env[envKeys[provider]];
  if (envKey) return envKey;

  // Then check stored config
  return config.get(`apiKeys.${provider}`);
}

/**
 * Set API key for provider
 * @param {string} provider - Provider name
 * @param {string} key - API key
 */
export function setApiKey(provider, key) {
  config.set(`apiKeys.${provider}`, key);
}

/**
 * Get current provider name
 * @returns {string}
 */
export function getCurrentProvider() {
  return config.get('provider');
}

/**
 * Get current model name
 * @returns {string}
 */
export function getCurrentModel() {
  return config.get('model');
}

/**
 * Set current provider and optionally model
 * @param {string} provider - Provider name
 * @param {string} [model] - Model name (optional, uses default if not provided)
 */
export function setProvider(provider, model) {
  const providerConfig = defaults.providers[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  config.set('provider', provider);
  config.set('model', model || providerConfig.defaultModel);
}

/**
 * Get all available providers
 * @returns {string[]}
 */
export function getProviders() {
  return Object.keys(defaults.providers);
}

/**
 * Get models for a provider
 * @param {string} provider - Provider name
 * @returns {string[]}
 */
export function getModels(provider) {
  return defaults.providers[provider]?.models || [];
}

/**
 * Check if running in Termux
 * @returns {boolean}
 */
export function isTermuxEnv() {
  return isTermux;
}

/**
 * Get config directory path
 * @returns {string}
 */
export function getConfigDir() {
  return configDir;
}

/**
 * Check if this is the first run (no API keys configured)
 * @returns {boolean}
 */
export function isFirstRun() {
  const setupComplete = config.get('setupComplete');
  if (setupComplete) return false;
  
  // Check if any API key is set
  return !hasAnyApiKey();
}

/**
 * Check if any API key is configured
 * @returns {boolean}
 */
export function hasAnyApiKey() {
  const providers = Object.keys(defaults.providers);
  for (const provider of providers) {
    if (getApiKey(provider)) return true;
  }
  return false;
}

/**
 * Mark setup as complete
 */
export function markSetupComplete() {
  config.set('setupComplete', true);
}

export default {
  get,
  set,
  getApiKey,
  setApiKey,
  getCurrentProvider,
  getCurrentModel,
  setProvider,
  getProviders,
  getModels,
  isTermuxEnv,
  getConfigDir,
  isFirstRun,
  hasAnyApiKey,
  markSetupComplete,
};

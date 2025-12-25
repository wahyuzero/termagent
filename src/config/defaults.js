// Default configuration values
export const defaults = {
  // Current provider and model
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',

  // Provider-specific defaults
  providers: {
    // === FREE TIER PROVIDERS ===
    groq: {
      baseUrl: 'https://api.groq.com/openai/v1',
      models: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        'deepseek-r1-distill-llama-70b',
      ],
      defaultModel: 'llama-3.3-70b-versatile',
    },
    zai: {
      baseUrl: 'https://api.zukijourney.com/v1',
      models: ['GLM-4.7', 'GLM-4.5-air', 'gpt-4o-mini', 'claude-3-haiku'],
      defaultModel: 'GLM-4.7',
    },
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      models: [
        'gemini-2.0-flash-exp',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
      ],
      defaultModel: 'gemini-1.5-flash',
    },
    mistral: {
      baseUrl: 'https://api.mistral.ai/v1',
      models: [
        'mistral-small-latest',
        'mistral-large-latest', 
        'open-mixtral-8x7b',
        'codestral-latest',
      ],
      defaultModel: 'mistral-small-latest',
    },
    openrouter: {
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [
        'anthropic/claude-3-haiku',
        'openai/gpt-4o-mini',
        'meta-llama/llama-3.3-70b-instruct',
        'google/gemini-flash-1.5',
        'mistralai/mistral-7b-instruct',
        'deepseek/deepseek-chat',
      ],
      defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    },
    
    // === PAID PROVIDERS ===
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'],
      defaultModel: 'gpt-4o-mini',
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      models: [
        'claude-3-5-sonnet-latest',
        'claude-3-5-haiku-latest',
        'claude-3-opus-latest',
      ],
      defaultModel: 'claude-3-5-sonnet-latest',
    },
    google: {
      models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      defaultModel: 'gemini-2.0-flash-exp',
    },
  },

  // Agent settings
  agent: {
    maxIterations: 10,
    confirmCommands: true,
    autoApproveReadOnly: true,
  },

  // UI settings
  ui: {
    theme: 'dark',
    syntaxHighlight: true,
    showToolCalls: true,
  },

  // Paths
  paths: {
    configDir: '.termagent',
    historyFile: 'history.json',
    keysFile: 'keys.enc',
  },
};

export default defaults;

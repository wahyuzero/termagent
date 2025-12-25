// Default configuration values
export const defaults = {
  // Current provider and model
  provider: 'openai',
  model: 'gpt-4o-mini',

  // Provider-specific defaults
  providers: {
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      defaultModel: 'gpt-4o-mini',
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      models: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ],
      defaultModel: 'claude-3-5-sonnet-20241022',
    },
    google: {
      models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      defaultModel: 'gemini-2.0-flash-exp',
    },
    groq: {
      baseUrl: 'https://api.groq.com/openai/v1',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
      defaultModel: 'llama-3.3-70b-versatile',
    },
    zai: {
      baseUrl: 'https://api.z.ai/api/coding/paas/v4',
      models: ['GLM-4.7', 'GLM-4.5-air'],
      defaultModel: 'GLM-4.7',
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

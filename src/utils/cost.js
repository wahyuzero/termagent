/**
 * Cost Tracking Utility
 * Tracks token usage and estimates costs per provider
 */

// Pricing per 1M tokens (USD) - Updated Dec 2024
const PRICING = {
  // Free tier providers (no cost but track for reference)
  groq: {
    input: 0,
    output: 0,
    note: 'Free tier - rate limited',
  },
  gemini: {
    input: 0,
    output: 0,
    note: 'Free tier - rate limited',
  },
  mistral: {
    input: 0,
    output: 0,
    note: 'Free tier - rate limited',
  },
  openrouter: {
    // Varies by model, using average
    input: 0.5,
    output: 1.5,
    note: 'Varies by model',
  },
  zai: {
    input: 0.5,
    output: 1.5,
    note: 'Estimate',
  },
  
  // Paid providers
  openai: {
    // GPT-4o pricing
    input: 2.5,
    output: 10,
    note: 'GPT-4o pricing',
  },
  anthropic: {
    // Claude 3.5 Sonnet pricing
    input: 3,
    output: 15,
    note: 'Claude 3.5 Sonnet',
  },
};

/**
 * Cost Tracker class
 */
class CostTracker {
  constructor() {
    this.sessions = new Map();
    this.currentSession = null;
    this.totalAllTime = {
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
    };
  }

  /**
   * Start a new session
   */
  startSession(provider) {
    this.currentSession = {
      id: `session_${Date.now()}`,
      provider,
      startedAt: new Date(),
      promptTokens: 0,
      completionTokens: 0,
      requests: 0,
    };
    return this.currentSession.id;
  }

  /**
   * Track token usage
   */
  track(provider, promptTokens, completionTokens) {
    if (!this.currentSession) {
      this.startSession(provider);
    }

    this.currentSession.promptTokens += promptTokens || 0;
    this.currentSession.completionTokens += completionTokens || 0;
    this.currentSession.requests += 1;

    // Update all-time totals
    this.totalAllTime.promptTokens += promptTokens || 0;
    this.totalAllTime.completionTokens += completionTokens || 0;
    this.totalAllTime.estimatedCost += this.calculateCost(provider, promptTokens, completionTokens);
  }

  /**
   * Calculate cost for token usage
   */
  calculateCost(provider, promptTokens, completionTokens) {
    const pricing = PRICING[provider] || PRICING.openrouter;
    
    // Cost per 1M tokens, so divide by 1M
    const inputCost = ((promptTokens || 0) / 1000000) * pricing.input;
    const outputCost = ((completionTokens || 0) / 1000000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get current session stats
   */
  getSessionStats() {
    if (!this.currentSession) {
      return null;
    }

    const { provider, promptTokens, completionTokens, requests, startedAt } = this.currentSession;
    const cost = this.calculateCost(provider, promptTokens, completionTokens);
    const pricing = PRICING[provider];

    return {
      provider,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      requests,
      estimatedCost: cost,
      isFree: (pricing?.input === 0 && pricing?.output === 0),
      duration: Date.now() - startedAt.getTime(),
    };
  }

  /**
   * Format cost for display
   */
  formatCost(cost) {
    if (cost === 0) return 'Free';
    if (cost < 0.01) return `< $0.01`;
    return `$${cost.toFixed(4)}`;
  }

  /**
   * Get summary string for display
   */
  getSummary() {
    const stats = this.getSessionStats();
    if (!stats) return 'No usage tracked';

    const { totalTokens, requests, estimatedCost, isFree, provider } = stats;
    
    if (isFree) {
      return `${totalTokens.toLocaleString()} tokens · ${requests} requests · Free (${provider})`;
    }
    
    return `${totalTokens.toLocaleString()} tokens · ${requests} requests · ~${this.formatCost(estimatedCost)}`;
  }

  /**
   * Get cost footer for response
   */
  getCostFooter() {
    const stats = this.getSessionStats();
    if (!stats) return '';

    const { promptTokens, completionTokens, estimatedCost, isFree } = stats;
    
    if (isFree) {
      return `📊 ${promptTokens}↑ ${completionTokens}↓ tokens`;
    }
    
    return `📊 ${promptTokens}↑ ${completionTokens}↓ tokens · ${this.formatCost(estimatedCost)}`;
  }
}

// Singleton instance
const costTracker = new CostTracker();

export { CostTracker, costTracker, PRICING };
export default costTracker;

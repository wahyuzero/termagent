import file from './file.js';
import shell from './shell.js';
import search from './search.js';
import git from './git.js';

// All available tools
const tools = {
  ...Object.fromEntries(file.definitions.map((d) => [d.name, { ...d, module: file }])),
  ...Object.fromEntries(shell.definitions.map((d) => [d.name, { ...d, module: shell }])),
  ...Object.fromEntries(search.definitions.map((d) => [d.name, { ...d, module: search }])),
  ...Object.fromEntries(git.definitions.map((d) => [d.name, { ...d, module: git }])),
};

/**
 * Get all tool definitions for AI providers
 * @returns {Array} Tool definitions
 */
export function getToolDefinitions() {
  return [...file.definitions, ...shell.definitions, ...search.definitions, ...git.definitions];
}

/**
 * Get a specific tool definition
 * @param {string} name - Tool name
 * @returns {Object|undefined}
 */
export function getTool(name) {
  return tools[name];
}

/**
 * Execute a tool by name
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {Object} options - Execution options
 * @returns {Promise<Object>}
 */
export async function executeTool(name, args, options = {}) {
  const tool = tools[name];
  if (!tool) {
    return { error: `Unknown tool: ${name}` };
  }

  return tool.module.execute(name, args, options);
}

/**
 * Get tools grouped by category
 * @returns {Object}
 */
export function getToolsByCategory() {
  return {
    file: file.definitions,
    shell: shell.definitions,
    search: search.definitions,
    git: git.definitions,
  };
}

/**
 * Get list of all tool names
 * @returns {string[]}
 */
export function getToolNames() {
  return Object.keys(tools);
}

export default {
  getToolDefinitions,
  getTool,
  executeTool,
  getToolsByCategory,
  getToolNames,
};

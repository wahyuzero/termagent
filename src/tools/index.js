import file from './file.js';
import shell from './shell.js';
import search from './search.js';
import git from './git.js';
import web from './web.js';
import lsp from './lsp.js';
import docker from './docker.js';
import security from './security.js';
import http from './http.js';
import testing from './testing.js';
import build from './build.js';
import plugins from '../plugins/index.js';
import mcp from '../mcp/index.js';

// Plugin tools (loaded dynamically)
let pluginTools = {};

// All available built-in tools (including MCP management)
const builtinTools = {
  ...Object.fromEntries(file.definitions.map((d) => [d.name, { ...d, module: file }])),
  ...Object.fromEntries(shell.definitions.map((d) => [d.name, { ...d, module: shell }])),
  ...Object.fromEntries(search.definitions.map((d) => [d.name, { ...d, module: search }])),
  ...Object.fromEntries(git.definitions.map((d) => [d.name, { ...d, module: git }])),
  ...Object.fromEntries(web.definitions.map((d) => [d.name, { ...d, module: web }])),
  ...Object.fromEntries(lsp.definitions.map((d) => [d.name, { ...d, module: lsp }])),
  ...Object.fromEntries(docker.definitions.map((d) => [d.name, { ...d, module: docker }])),
  ...Object.fromEntries(security.definitions.map((d) => [d.name, { ...d, module: security }])),
  ...Object.fromEntries(http.definitions.map((d) => [d.name, { ...d, module: http }])),
  ...Object.fromEntries(testing.definitions.map((d) => [d.name, { ...d, module: testing }])),
  ...Object.fromEntries(build.definitions.map((d) => [d.name, { ...d, module: build }])),
  ...Object.fromEntries(mcp.definitions.map((d) => [d.name, { ...d, module: mcp }])),
};

/**
 * Initialize tools (load plugins and connect MCP servers)
 */
export async function initTools() {
  const loadedPlugins = await plugins.loadPlugins();
  
  // Register plugin tools
  for (const plugin of loadedPlugins) {
    for (const def of plugin.definitions) {
      pluginTools[def.name] = { ...def, module: plugin };
    }
  }
  
  // Connect MCP servers (silently, don't fail if no servers)
  try {
    await mcp.connectAllServers();
  } catch (e) {
    // Ignore MCP connection errors on startup
  }
  
  return loadedPlugins.length;
}

/**
 * Get all tool definitions for AI providers
 * @returns {Array} Tool definitions
 */
export function getToolDefinitions() {
  const builtin = [
    ...file.definitions,
    ...shell.definitions,
    ...search.definitions,
    ...git.definitions,
    ...web.definitions,
    ...lsp.definitions,
    ...docker.definitions,
    ...security.definitions,
    ...http.definitions,
    ...testing.definitions,
    ...build.definitions,
    ...mcp.definitions,
  ];
  
  const pluginDefs = plugins.getPluginDefinitions();
  
  // Add MCP server tools dynamically
  const mcpDefs = mcp.getMcpToolDefinitions();
  
  return [...builtin, ...pluginDefs, ...mcpDefs];
}

/**
 * Get a specific tool definition
 * @param {string} name - Tool name
 * @returns {Object|undefined}
 */
export function getTool(name) {
  return builtinTools[name] || pluginTools[name];
}

/**
 * Execute a tool by name
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {Object} options - Execution options
 * @returns {Promise<Object>}
 */
export async function executeTool(name, args, options = {}) {
  // Check MCP tools first (mcp_* prefix)
  if (mcp.isMcpTool(name)) {
    return mcp.executeMcpTool(name, args);
  }
  
  // Check built-in tools
  const builtinTool = builtinTools[name];
  if (builtinTool) {
    return builtinTool.module.execute(name, args, options);
  }
  
  // Check plugin tools
  if (plugins.isPluginTool(name)) {
    return plugins.executePluginTool(name, args, options);
  }
  
  return { error: `Unknown tool: ${name}` };
}

/**
 * Get tools grouped by category
 * @returns {Object}
 */
export function getToolsByCategory() {
  const categories = {
    file: file.definitions,
    shell: shell.definitions,
    search: search.definitions,
    git: git.definitions,
    web: web.definitions,
    lsp: lsp.definitions,
  };
  
  // Add plugin category if any plugins loaded
  const pluginDefs = plugins.getPluginDefinitions();
  if (pluginDefs.length > 0) {
    categories.plugins = pluginDefs;
  }
  
  return categories;
}

/**
 * Get list of all tool names
 * @returns {string[]}
 */
export function getToolNames() {
  const builtinNames = Object.keys(builtinTools);
  const pluginNames = plugins.getPluginDefinitions().map(d => d.name);
  return [...builtinNames, ...pluginNames];
}

/**
 * Get loaded plugins info
 */
export function getPlugins() {
  return plugins.getLoadedPlugins();
}

export default {
  initTools,
  getToolDefinitions,
  getTool,
  executeTool,
  getToolsByCategory,
  getToolNames,
  getPlugins,
};

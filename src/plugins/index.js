/**
 * Plugin System
 * Load custom tools from ~/.termagent/plugins/
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { pathToFileURL } from 'url';

const PLUGINS_DIR = join(homedir(), '.termagent', 'plugins');

// Registered plugins
const plugins = new Map();

/**
 * Load all plugins from plugins directory
 */
export async function loadPlugins() {
  try {
    const entries = await readdir(PLUGINS_DIR);
    
    for (const entry of entries) {
      const pluginPath = join(PLUGINS_DIR, entry);
      const stats = await stat(pluginPath);
      
      if (stats.isFile() && entry.endsWith('.js')) {
        // Load single file plugin
        await loadPlugin(pluginPath);
      } else if (stats.isDirectory()) {
        // Load directory plugin (index.js)
        const indexPath = join(pluginPath, 'index.js');
        try {
          await stat(indexPath);
          await loadPlugin(indexPath, entry);
        } catch {
          // No index.js, skip
        }
      }
    }
  } catch (error) {
    // Plugins directory doesn't exist - that's fine
    if (error.code !== 'ENOENT') {
      console.warn(`Warning: Failed to load plugins: ${error.message}`);
    }
  }
  
  return Array.from(plugins.values());
}

/**
 * Load a single plugin
 */
async function loadPlugin(filepath, name = null) {
  const pluginName = name || basename(filepath, '.js');
  
  try {
    // Dynamic import using file URL
    const pluginUrl = pathToFileURL(filepath).href;
    const module = await import(pluginUrl);
    
    // Validate plugin structure
    if (!module.definitions || !Array.isArray(module.definitions)) {
      console.warn(`Plugin ${pluginName}: missing 'definitions' array`);
      return;
    }
    
    if (!module.execute || typeof module.execute !== 'function') {
      console.warn(`Plugin ${pluginName}: missing 'execute' function`);
      return;
    }
    
    // Register plugin
    plugins.set(pluginName, {
      name: pluginName,
      path: filepath,
      definitions: module.definitions,
      execute: module.execute,
    });
    
  } catch (error) {
    console.warn(`Failed to load plugin ${pluginName}: ${error.message}`);
  }
}

/**
 * Get all plugin tool definitions
 */
export function getPluginDefinitions() {
  const definitions = [];
  for (const plugin of plugins.values()) {
    for (const def of plugin.definitions) {
      definitions.push({
        ...def,
        _plugin: plugin.name,
      });
    }
  }
  return definitions;
}

/**
 * Execute a plugin tool
 */
export async function executePluginTool(name, args, options = {}) {
  for (const plugin of plugins.values()) {
    const def = plugin.definitions.find(d => d.name === name);
    if (def) {
      return await plugin.execute(name, args, options);
    }
  }
  return { error: `Plugin tool not found: ${name}` };
}

/**
 * Check if a tool is from a plugin
 */
export function isPluginTool(name) {
  for (const plugin of plugins.values()) {
    if (plugin.definitions.some(d => d.name === name)) {
      return true;
    }
  }
  return false;
}

/**
 * Get list of loaded plugins
 */
export function getLoadedPlugins() {
  return Array.from(plugins.entries()).map(([name, plugin]) => ({
    name,
    path: plugin.path,
    tools: plugin.definitions.map(d => d.name),
  }));
}

/**
 * Create example plugin template
 */
export function getPluginTemplate() {
  return `/**
 * Example TermAgent Plugin
 * Save this file to ~/.termagent/plugins/my-plugin.js
 */

// Define your tools
export const definitions = [
  {
    name: 'my_custom_tool',
    description: 'Description of what this tool does',
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Input parameter description',
        },
      },
      required: ['input'],
    },
  },
];

// Implement tool execution
export async function execute(name, args, options = {}) {
  switch (name) {
    case 'my_custom_tool':
      // Your implementation here
      return {
        success: true,
        result: \`Processed: \${args.input}\`,
      };
    default:
      return { error: \`Unknown tool: \${name}\` };
  }
}
`;
}

export default {
  loadPlugins,
  getPluginDefinitions,
  executePluginTool,
  isPluginTool,
  getLoadedPlugins,
  getPluginTemplate,
};

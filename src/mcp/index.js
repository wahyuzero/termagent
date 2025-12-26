/**
 * MCP (Model Context Protocol) Client
 * Basic implementation for connecting to MCP servers via stdio
 * 
 * Config file: ~/.termagent/mcp.json
 * {
 *   "servers": {
 *     "name": {
 *       "command": "npx",
 *       "args": ["-y", "@anthropic/mcp-server-xxx"],
 *       "env": {}
 *     }
 *   }
 * }
 */

import { spawn } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

const CONFIG_DIR = join(homedir(), '.termagent');
const CONFIG_FILE = join(CONFIG_DIR, 'mcp.json');

// Active server connections
const servers = new Map();

/**
 * JSON-RPC message ID counter
 */
let messageId = 0;

/**
 * MCP Server Connection
 */
class McpServer extends EventEmitter {
  constructor(name, config) {
    super();
    this.name = name;
    this.config = config;
    this.process = null;
    this.tools = [];
    this.resources = [];
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  /**
   * Start the server process
   */
  async start() {
    return new Promise((resolve, reject) => {
      const { command, args = [], env = {} } = this.config;
      
      this.process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
      });

      this.process.stdout.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.process.stderr.on('data', (data) => {
        console.error(`[MCP ${this.name}] ${data}`);
      });

      this.process.on('error', (err) => {
        reject(new Error(`Failed to start MCP server ${this.name}: ${err.message}`));
      });

      this.process.on('close', (code) => {
        this.emit('close', code);
        servers.delete(this.name);
      });

      // Initialize connection
      setTimeout(async () => {
        try {
          await this.initialize();
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 500);
    });
  }

  /**
   * Handle incoming data
   */
  handleData(data) {
    this.buffer += data;
    
    // Split by newlines and process complete JSON messages
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  /**
   * Handle JSON-RPC message
   */
  handleMessage(message) {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || 'MCP error'));
      } else {
        resolve(message.result);
      }
    } else if (message.method) {
      // Handle notifications
      this.emit('notification', message);
    }
  }

  /**
   * Send JSON-RPC request
   */
  async request(method, params = {}, timeoutMs = 60000) {
    const id = ++messageId;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      this.process.stdin.write(message + '\n');
    });
  }

  /**
   * Initialize MCP connection
   */
  async initialize() {
    // Send initialize request
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: false },
        sampling: {},
      },
      clientInfo: {
        name: 'termagent',
        version: '1.0.0',
      },
    });

    // Send initialized notification
    this.process.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }) + '\n');

    // Get available tools
    try {
      const toolsResult = await this.request('tools/list');
      this.tools = toolsResult.tools || [];
    } catch (e) {
      this.tools = [];
    }

    return result;
  }

  /**
   * Call a tool
   */
  async callTool(name, args) {
    const result = await this.request('tools/call', {
      name,
      arguments: args,
    });
    return result;
  }

  /**
   * Stop the server
   */
  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

/**
 * Load MCP config
 * Supports both 'servers' and 'mcpServers' keys (Claude Desktop compatibility)
 */
export async function loadConfig() {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content);
    
    // Support both 'servers' and 'mcpServers' keys
    const servers = config.servers || config.mcpServers || {};
    
    return { servers };
  } catch (e) {
    // Return empty config if file doesn't exist
    return { servers: {} };
  }
}

/**
 * Save default config
 */
export async function saveDefaultConfig() {
  await mkdir(CONFIG_DIR, { recursive: true });
  
  const defaultConfig = {
    servers: {
      // Example configuration (commented style)
      // "filesystem": {
      //   "command": "npx",
      //   "args": ["-y", "@anthropic/mcp-server-filesystem", "/home"],
      //   "env": {}
      // }
    },
  };
  
  await writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  return defaultConfig;
}

/**
 * Connect to an MCP server
 */
export async function connectServer(name) {
  if (servers.has(name)) {
    return servers.get(name);
  }

  const config = await loadConfig();
  const serverConfig = config.servers[name];
  
  if (!serverConfig) {
    throw new Error(`MCP server not configured: ${name}`);
  }

  const server = new McpServer(name, serverConfig);
  await server.start();
  servers.set(name, server);
  
  return server;
}

/**
 * Connect to all configured servers
 */
export async function connectAllServers() {
  const config = await loadConfig();
  const results = [];
  
  for (const name of Object.keys(config.servers)) {
    try {
      const server = await connectServer(name);
      results.push({
        name,
        status: 'connected',
        tools: server.tools.length,
      });
    } catch (error) {
      results.push({
        name,
        status: 'failed',
        error: error.message,
      });
    }
  }
  
  return results;
}

/**
 * Get all tools from connected MCP servers
 */
export function getMcpTools() {
  const tools = [];
  
  for (const [serverName, server] of servers) {
    for (const tool of server.tools) {
      tools.push({
        ...tool,
        _mcpServer: serverName,
        // Format for AI provider
        name: `mcp_${serverName}_${tool.name}`,
        description: `[MCP:${serverName}] ${tool.description || tool.name}`,
      });
    }
  }
  
  return tools;
}

/**
 * Get tool definitions for AI
 */
export function getMcpToolDefinitions() {
  return getMcpTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema || { type: 'object', properties: {} },
  }));
}

/**
 * Check if a tool is a dynamic MCP server tool (not management commands)
 * Management commands (mcp_connect, mcp_list) use normal execute path
 * Dynamic tools from servers use mcp_<server>_<tool> format
 */
export function isMcpTool(name) {
  // Management commands are NOT dynamic MCP tools
  const managementCommands = ['mcp_connect', 'mcp_list'];
  if (managementCommands.includes(name)) {
    return false;
  }
  
  // Dynamic MCP tools have format: mcp_<server>_<tool> (at least 3 parts)
  if (name.startsWith('mcp_')) {
    const parts = name.replace('mcp_', '').split('_');
    // Need at least server and tool name
    return parts.length >= 2 && parts[1].length > 0;
  }
  
  return false;
}

/**
 * Execute an MCP tool with retry and fallback
 */
export async function executeMcpTool(toolName, args) {
  // Parse tool name: mcp_<server>_<tool>
  const parts = toolName.replace('mcp_', '').split('_');
  const serverName = parts[0];
  const actualToolName = parts.slice(1).join('_');
  
  const server = servers.get(serverName);
  if (!server) {
    return { error: `MCP server not connected: ${serverName}` };
  }
  
  // Retry logic: try up to 2 times
  const maxRetries = 2;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await server.callTool(actualToolName, args);
      return {
        success: true,
        content: result.content,
      };
    } catch (error) {
      lastError = error;
      
      // Only retry on timeout errors
      if (!error.message.includes('timeout') || attempt === maxRetries) {
        break;
      }
      
      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Return error with fallback suggestion
  return { 
    error: lastError.message,
    fallback: `Consider using built-in tool instead. MCP tool "${actualToolName}" timed out.`,
  };
}

/**
 * List connected servers
 */
export function listServers() {
  const list = [];
  for (const [name, server] of servers) {
    list.push({
      name,
      tools: server.tools.map(t => t.name),
      status: 'connected',
    });
  }
  return list;
}

/**
 * Disconnect a server
 */
export function disconnectServer(name) {
  const server = servers.get(name);
  if (server) {
    server.stop();
    servers.delete(name);
    return true;
  }
  return false;
}

/**
 * Disconnect all servers
 */
export function disconnectAllServers() {
  for (const server of servers.values()) {
    server.stop();
  }
  servers.clear();
}

/**
 * Tool definitions for MCP management
 */
export const definitions = [
  {
    name: 'mcp_connect',
    description: 'Connect to an MCP server by name. The server must be configured in ~/.termagent/mcp.json',
    parameters: {
      type: 'object',
      properties: {
        server: {
          type: 'string',
          description: 'Name of the server to connect to',
        },
      },
      required: ['server'],
    },
  },
  {
    name: 'mcp_list',
    description: 'List all connected MCP servers and their available tools',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Execute MCP management tools
 */
export async function execute(name, args) {
  switch (name) {
    case 'mcp_connect':
      try {
        const server = await connectServer(args.server);
        return {
          success: true,
          server: args.server,
          tools: server.tools.map(t => ({ name: t.name, description: t.description })),
        };
      } catch (error) {
        return { error: error.message };
      }
    
    case 'mcp_list':
      return {
        success: true,
        servers: listServers(),
        configPath: CONFIG_FILE,
      };
    
    default:
      // Check if it's an MCP tool call
      if (isMcpTool(name)) {
        return await executeMcpTool(name, args);
      }
      return { error: `Unknown MCP command: ${name}` };
  }
}

export default {
  loadConfig,
  saveDefaultConfig,
  connectServer,
  connectAllServers,
  getMcpTools,
  getMcpToolDefinitions,
  isMcpTool,
  executeMcpTool,
  listServers,
  disconnectServer,
  disconnectAllServers,
  definitions,
  execute,
};

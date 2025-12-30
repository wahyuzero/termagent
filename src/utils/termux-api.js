/**
 * Termux:API Integration
 * Optional features when Termux:API is installed
 * 
 * Install: pkg install termux-api
 * + Termux:API app from F-Droid
 */

import { execSync, spawn } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_FILE = join(homedir(), '.termagent', 'termux-api.json');

// Default config
const DEFAULT_CONFIG = {
  enabled: true,
  clipboard: true,
  notifications: true,
  toast: true,
  vibrate: true,
  confirmDialog: true,
  tts: false,  // Opt-in
};

// Cached state
let apiAvailable = null;
let config = null;

/**
 * Check if Termux:API is available
 */
export function checkTermuxApi() {
  if (apiAvailable !== null) return apiAvailable;
  
  try {
    execSync('which termux-toast', { encoding: 'utf-8', stdio: 'pipe' });
    apiAvailable = true;
  } catch {
    apiAvailable = false;
  }
  
  return apiAvailable;
}

/**
 * Get current config
 */
export async function getConfig() {
  if (config !== null) return config;
  
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
  
  return config;
}

/**
 * Save config
 */
export async function saveConfig(newConfig) {
  await mkdir(join(homedir(), '.termagent'), { recursive: true });
  config = { ...config, ...newConfig };
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  return config;
}

/**
 * Toggle a config option
 */
export async function toggleOption(option) {
  const cfg = await getConfig();
  if (!(option in cfg)) {
    return { error: `Unknown option: ${option}` };
  }
  cfg[option] = !cfg[option];
  await saveConfig(cfg);
  return { option, enabled: cfg[option] };
}

/**
 * Check if feature is enabled
 */
export async function isEnabled(feature) {
  if (!checkTermuxApi()) return false;
  const cfg = await getConfig();
  return cfg.enabled && cfg[feature];
}

// ============================================
// CLIPBOARD
// ============================================

/**
 * Read from Android clipboard
 */
export async function clipboardRead() {
  if (!await isEnabled('clipboard')) {
    return { error: 'Clipboard integration disabled or Termux:API not available' };
  }
  
  try {
    const result = execSync('termux-clipboard-get', { encoding: 'utf-8', timeout: 5000 });
    return { success: true, content: result };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Write to Android clipboard
 */
export async function clipboardWrite(text) {
  if (!await isEnabled('clipboard')) {
    return { error: 'Clipboard integration disabled or Termux:API not available' };
  }
  
  try {
    const proc = spawn('termux-clipboard-set', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin.write(text);
    proc.stdin.end();
    
    await new Promise((resolve, reject) => {
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('Failed')));
      proc.on('error', reject);
    });
    
    return { success: true, message: 'Copied to clipboard' };
  } catch (error) {
    return { error: error.message };
  }
}

// ============================================
// NOTIFICATIONS & TOAST
// ============================================

/**
 * Show toast message
 */
export async function showToast(message, options = {}) {
  if (!await isEnabled('toast')) return { skipped: true };
  
  try {
    const args = [message];
    if (options.short) args.push('-s');
    if (options.position) args.push('-g', options.position); // top, middle, bottom
    if (options.background) args.push('-b', options.background);
    if (options.color) args.push('-c', options.color);
    
    execSync(`termux-toast ${args.map(a => `"${a}"`).join(' ')}`, { 
      encoding: 'utf-8',
      timeout: 3000 
    });
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Show notification
 */
export async function showNotification(title, content, options = {}) {
  if (!await isEnabled('notifications')) return { skipped: true };
  
  try {
    const args = ['-t', title, '-c', content];
    if (options.id) args.push('-i', options.id);
    if (options.ongoing) args.push('--ongoing');
    if (options.alertOnce) args.push('--alert-once');
    if (options.priority) args.push('--priority', options.priority); // high, low, max, min, default
    
    execSync(`termux-notification ${args.map(a => `"${a}"`).join(' ')}`, {
      encoding: 'utf-8',
      timeout: 5000
    });
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Vibrate
 */
export async function vibrate(durationMs = 200) {
  if (!await isEnabled('vibrate')) return { skipped: true };
  
  try {
    execSync(`termux-vibrate -d ${durationMs}`, { encoding: 'utf-8', timeout: 2000 });
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

// ============================================
// CONFIRM DIALOG
// ============================================

/**
 * Show confirm dialog (returns true/false)
 */
export async function showConfirmDialog(title, hint = '') {
  if (!await isEnabled('confirmDialog')) {
    return null; // Fallback to terminal confirmation
  }
  
  try {
    const args = ['confirm', '-t', title];
    if (hint) args.push('-i', hint);
    
    const result = execSync(`termux-dialog ${args.map(a => `"${a}"`).join(' ')}`, {
      encoding: 'utf-8',
      timeout: 60000 // 1 minute timeout for user input
    });
    
    const parsed = JSON.parse(result);
    return parsed.text === 'yes';
  } catch (error) {
    return null; // Fallback to terminal
  }
}

/**
 * Show text input dialog
 */
export async function showInputDialog(title, hint = '', multiline = false) {
  if (!await isEnabled('confirmDialog')) {
    return null;
  }
  
  try {
    const type = multiline ? 'text' : 'text';
    const args = [type, '-t', title];
    if (hint) args.push('-i', hint);
    if (multiline) args.push('-m');
    
    const result = execSync(`termux-dialog ${args.map(a => `"${a}"`).join(' ')}`, {
      encoding: 'utf-8',
      timeout: 120000
    });
    
    const parsed = JSON.parse(result);
    return parsed.text;
  } catch (error) {
    return null;
  }
}

// ============================================
// TTS (Text-to-Speech)
// ============================================

/**
 * Speak text
 */
export async function speak(text) {
  if (!await isEnabled('tts')) return { skipped: true };
  
  try {
    const proc = spawn('termux-tts-speak', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin.write(text);
    proc.stdin.end();
    
    await new Promise((resolve) => {
      proc.on('close', resolve);
      // Don't wait too long
      setTimeout(resolve, 30000);
    });
    
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

// ============================================
// TOOL DEFINITIONS
// ============================================

export const definitions = [
  {
    name: 'clipboard_read',
    description: 'Read content from Android clipboard. Only works if Termux:API is installed.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'clipboard_write',
    description: 'Write/copy text to Android clipboard. Only works if Termux:API is installed.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to copy to clipboard',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'android_notify',
    description: 'Show an Android notification. Only works if Termux:API is installed.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Notification title',
        },
        content: {
          type: 'string',
          description: 'Notification content',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'android_toast',
    description: 'Show a quick toast message on screen. Only works if Termux:API is installed.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to show',
        },
      },
      required: ['message'],
    },
  },
];

/**
 * Execute Termux:API tools
 */
export async function execute(name, args) {
  // Check availability first
  if (!checkTermuxApi()) {
    return { 
      error: 'Termux:API not available. Install with: pkg install termux-api',
      hint: 'Also install Termux:API app from F-Droid'
    };
  }

  switch (name) {
    case 'clipboard_read':
      return await clipboardRead();
    
    case 'clipboard_write':
      return await clipboardWrite(args.text);
    
    case 'android_notify':
      return await showNotification(args.title, args.content);
    
    case 'android_toast':
      return await showToast(args.message);
    
    default:
      return { error: `Unknown Termux:API tool: ${name}` };
  }
}

// ============================================
// STATUS & INFO
// ============================================

/**
 * Get Termux:API status
 */
export async function getStatus() {
  const available = checkTermuxApi();
  const cfg = available ? await getConfig() : null;
  
  return {
    available,
    config: cfg,
    features: available ? {
      clipboard: await isEnabled('clipboard'),
      notifications: await isEnabled('notifications'),
      toast: await isEnabled('toast'),
      vibrate: await isEnabled('vibrate'),
      confirmDialog: await isEnabled('confirmDialog'),
      tts: await isEnabled('tts'),
    } : null,
  };
}

export default {
  checkTermuxApi,
  getConfig,
  saveConfig,
  toggleOption,
  isEnabled,
  clipboardRead,
  clipboardWrite,
  showToast,
  showNotification,
  vibrate,
  showConfirmDialog,
  showInputDialog,
  speak,
  definitions,
  execute,
  getStatus,
};

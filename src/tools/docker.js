/**
 * Docker Tools
 * Wrapper for Docker CLI commands
 */

import { spawn } from 'child_process';

/**
 * Tool Definitions
 */
export const definitions = [
  {
    name: 'docker_ps',
    description: 'List running Docker containers. Use docker_ps to see what containers are running.',
    parameters: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'Show all containers (default shows just running)',
        },
      },
    },
  },
  {
    name: 'docker_images',
    description: 'List Docker images available locally.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'docker_build',
    description: 'Build a Docker image from a Dockerfile.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to directory containing Dockerfile (default: current dir)',
        },
        tag: {
          type: 'string',
          description: 'Tag for the image (e.g., myapp:latest)',
        },
      },
      required: ['tag'],
    },
  },
  {
    name: 'docker_run',
    description: 'Run a Docker container from an image.',
    parameters: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: 'Image name to run',
        },
        detach: {
          type: 'boolean',
          description: 'Run in background (detached mode)',
        },
        ports: {
          type: 'string',
          description: 'Port mapping (e.g., "8080:80")',
        },
        name: {
          type: 'string',
          description: 'Container name',
        },
      },
      required: ['image'],
    },
  },
  {
    name: 'docker_stop',
    description: 'Stop a running Docker container.',
    parameters: {
      type: 'object',
      properties: {
        container: {
          type: 'string',
          description: 'Container ID or name to stop',
        },
      },
      required: ['container'],
    },
  },
  {
    name: 'docker_logs',
    description: 'Get logs from a Docker container.',
    parameters: {
      type: 'object',
      properties: {
        container: {
          type: 'string',
          description: 'Container ID or name',
        },
        tail: {
          type: 'integer',
          description: 'Number of lines to show from end (default: 100)',
        },
      },
      required: ['container'],
    },
  },
  {
    name: 'docker_compose',
    description: 'Run docker-compose commands (up, down, ps, logs).',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to run: up, down, ps, logs, build',
        },
        path: {
          type: 'string',
          description: 'Path to docker-compose.yml directory',
        },
        detach: {
          type: 'boolean',
          description: 'Run in background (for "up" command)',
        },
      },
      required: ['command'],
    },
  },
];

/**
 * Run shell command and return output
 */
function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 60000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data; });
    proc.stderr?.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
      });
    });
  });
}

/**
 * Check if Docker is available
 */
async function checkDocker() {
  const result = await runCommand('docker', ['--version']);
  return result.success;
}

/**
 * Execute tool
 */
export async function execute(name, args) {
  // Check Docker availability
  if (!(await checkDocker())) {
    return { error: 'Docker is not installed or not running' };
  }

  switch (name) {
    case 'docker_ps': {
      const cmdArgs = ['ps', '--format', 'table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}'];
      if (args.all) cmdArgs.push('-a');
      const result = await runCommand('docker', cmdArgs);
      return result.success
        ? { success: true, containers: result.stdout }
        : { error: result.stderr || result.error };
    }

    case 'docker_images': {
      const result = await runCommand('docker', ['images', '--format', 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}']);
      return result.success
        ? { success: true, images: result.stdout }
        : { error: result.stderr || result.error };
    }

    case 'docker_build': {
      const cmdArgs = ['build', '-t', args.tag, args.path || '.'];
      const result = await runCommand('docker', cmdArgs, { timeout: 300000 });
      return result.success
        ? { success: true, message: `Built image: ${args.tag}`, output: result.stdout.slice(-500) }
        : { error: result.stderr || result.error };
    }

    case 'docker_run': {
      const cmdArgs = ['run'];
      if (args.detach) cmdArgs.push('-d');
      if (args.ports) cmdArgs.push('-p', args.ports);
      if (args.name) cmdArgs.push('--name', args.name);
      cmdArgs.push(args.image);
      
      const result = await runCommand('docker', cmdArgs);
      return result.success
        ? { success: true, containerId: result.stdout.trim() }
        : { error: result.stderr || result.error };
    }

    case 'docker_stop': {
      const result = await runCommand('docker', ['stop', args.container]);
      return result.success
        ? { success: true, message: `Stopped: ${args.container}` }
        : { error: result.stderr || result.error };
    }

    case 'docker_logs': {
      const cmdArgs = ['logs'];
      if (args.tail) cmdArgs.push('--tail', String(args.tail));
      else cmdArgs.push('--tail', '100');
      cmdArgs.push(args.container);
      
      const result = await runCommand('docker', cmdArgs);
      return result.success
        ? { success: true, logs: result.stdout }
        : { error: result.stderr || result.error };
    }

    case 'docker_compose': {
      const cmd = args.command;
      const cmdArgs = ['compose'];
      if (args.path) cmdArgs.push('-f', `${args.path}/docker-compose.yml`);
      cmdArgs.push(cmd);
      if (cmd === 'up' && args.detach) cmdArgs.push('-d');
      
      const result = await runCommand('docker', cmdArgs, { timeout: 300000 });
      return result.success
        ? { success: true, output: result.stdout || result.stderr }
        : { error: result.stderr || result.error };
    }

    default:
      return { error: `Unknown docker tool: ${name}` };
  }
}

export default { definitions, execute };

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';

/**
 * Project templates for quick initialization
 */

const TEMPLATES = {
  node: {
    name: 'Node.js Project',
    files: {
      'package.json': JSON.stringify({
        name: 'my-project',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js',
        scripts: {
          start: 'node src/index.js',
          dev: 'node --watch src/index.js',
          test: 'node --test',
        },
        keywords: [],
        author: '',
        license: 'MIT',
      }, null, 2),
      'src/index.js': `// Entry point
console.log('Hello, World!');
`,
      'README.md': `# My Project

A Node.js project.

## Usage

\`\`\`bash
npm start
\`\`\`
`,
      '.gitignore': `node_modules/
.env
*.log
dist/
`,
    },
  },

  python: {
    name: 'Python Project',
    files: {
      'requirements.txt': `# Add your dependencies here
`,
      'src/__init__.py': '',
      'src/main.py': `#!/usr/bin/env python3
"""Main entry point."""


def main():
    print("Hello, World!")


if __name__ == "__main__":
    main()
`,
      'README.md': `# My Project

A Python project.

## Usage

\`\`\`bash
python src/main.py
\`\`\`
`,
      '.gitignore': `__pycache__/
*.pyc
.venv/
venv/
.env
*.egg-info/
dist/
build/
`,
    },
  },

  react: {
    name: 'React + Vite Project',
    files: {
      'package.json': JSON.stringify({
        name: 'my-react-app',
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          '@vitejs/plugin-react': '^4.2.0',
          vite: '^5.0.0',
        },
      }, null, 2),
      'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
      'src/main.jsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
      'src/App.jsx': `function App() {
  return (
    <div>
      <h1>Hello, React!</h1>
    </div>
  )
}

export default App
`,
      'src/index.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, sans-serif;
}
`,
      'vite.config.js': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
      '.gitignore': `node_modules/
dist/
.env
*.log
`,
      'README.md': `# My React App

Built with React + Vite.

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
    },
  },

  express: {
    name: 'Express.js API',
    files: {
      'package.json': JSON.stringify({
        name: 'my-api',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js',
        scripts: {
          start: 'node src/index.js',
          dev: 'node --watch src/index.js',
        },
        dependencies: {
          express: '^4.18.2',
          cors: '^2.8.5',
        },
      }, null, 2),
      'src/index.js': `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello, API!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});
`,
      '.gitignore': `node_modules/
.env
*.log
`,
      'README.md': `# My API

Express.js API server.

## Usage

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
    },
  },

  cli: {
    name: 'CLI Tool',
    files: {
      'package.json': JSON.stringify({
        name: 'my-cli',
        version: '1.0.0',
        type: 'module',
        bin: {
          'my-cli': './src/cli.js',
        },
        scripts: {
          start: 'node src/cli.js',
        },
        dependencies: {
          commander: '^12.0.0',
          chalk: '^5.3.0',
        },
      }, null, 2),
      'src/cli.js': `#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';

program
  .name('my-cli')
  .description('My CLI tool')
  .version('1.0.0');

program
  .command('hello')
  .description('Say hello')
  .argument('[name]', 'Your name', 'World')
  .action((name) => {
    console.log(chalk.green(\`Hello, \${name}!\`));
  });

program.parse();
`,
      '.gitignore': `node_modules/
.env
*.log
`,
      'README.md': `# My CLI

A command-line tool.

## Installation

\`\`\`bash
npm install
npm link
\`\`\`

## Usage

\`\`\`bash
my-cli hello [name]
\`\`\`
`,
    },
  },
};

/**
 * List available templates
 */
export function listTemplates() {
  return Object.entries(TEMPLATES).map(([key, template]) => ({
    id: key,
    name: template.name,
  }));
}

/**
 * Initialize a project from template
 */
export async function initProject(templateId, targetDir = process.cwd()) {
  const template = TEMPLATES[templateId];
  
  if (!template) {
    return {
      success: false,
      error: `Unknown template: ${templateId}. Available: ${Object.keys(TEMPLATES).join(', ')}`,
    };
  }

  const created = [];
  const errors = [];

  for (const [filepath, content] of Object.entries(template.files)) {
    const fullPath = join(targetDir, filepath);
    
    try {
      // Create directory if needed
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (dir) {
        await mkdir(dir, { recursive: true });
      }
      
      // Write file
      await writeFile(fullPath, content);
      created.push(filepath);
    } catch (error) {
      errors.push({ file: filepath, error: error.message });
    }
  }

  return {
    success: errors.length === 0,
    template: template.name,
    created,
    errors,
  };
}

/**
 * Print template initialization result
 */
export function printInitResult(result) {
  if (result.success) {
    console.log(chalk.green.bold(`\n✓ Created ${result.template}\n`));
    console.log(chalk.gray('Files created:'));
    result.created.forEach(f => {
      console.log(chalk.gray(`  ✓ ${f}`));
    });
    console.log();
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.white('  npm install'));
    console.log(chalk.white('  npm start'));
    console.log();
  } else {
    console.log(chalk.red(`\nError: ${result.error}\n`));
  }
}

export default { listTemplates, initProject, printInitResult };

# 🤖 TermAgent

**AI Coding Agent for Termux** - A powerful terminal-based AI coding assistant
with multi-provider support.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## ✨ Features

- **Multi-Provider Support** - OpenAI, Anthropic (Claude), Google (Gemini),
  Groq, Z.AI
- **Interactive Chat** - REPL-style continuous conversation
- **File Operations** - Read, write, edit, search files with undo support
- **Shell Execution** - Run commands with safety checks
- **Code Search** - Grep patterns and find definitions
- **Git Integration** - Status, diff, log, branch operations
- **Session Management** - Continue previous conversations
- **Project Templates** - Quick-start Node.js, Python, React, Express, CLI
- **Undo System** - Revert file changes made by AI
- **Beautiful CLI** - Colored output, spinners, and detailed feedback

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/wahyuzero/termagent.git
cd termagent

# Install dependencies
npm install

# Install globally
npm link

# Verify installation
termagent --version
```

## 🚀 Quick Start

```bash
# First run - setup wizard will guide you
termagent

# Or set API key and start directly
export ZAI_API_KEY="your-key"  # or GROQ_API_KEY, OPENAI_API_KEY, etc.
termagent "Create a hello world script"
```

## 🔑 API Keys

Get your API key from one of these providers:

| Provider  | Free Tier  | Get API Key                                            |
| --------- | ---------- | ------------------------------------------------------ |
| **Groq**  | ✅ Yes     | [console.groq.com](https://console.groq.com)           |
| **Z.AI**  | ✅ Yes     | [z.ai](https://z.ai)                                   |
| OpenAI    | ❌ Paid    | [platform.openai.com](https://platform.openai.com)     |
| Anthropic | ❌ Paid    | [console.anthropic.com](https://console.anthropic.com) |
| Google    | ⚠️ Limited | [aistudio.google.com](https://aistudio.google.com)     |

## 📖 Usage

### Basic Commands

```bash
# Send a single message
termagent "List files in current directory"

# Continue last session
termagent -c "What was I working on?"

# Use specific provider
termagent --provider groq "Create a Python script"

# Interactive session picker
termagent
```

### Interactive Chat Mode

```bash
# Start interactive chat
termagent chat

# With session continuation
termagent chat -c
```

**Chat Commands:**

- `/help` - Show available commands
- `/files` - List files in directory
- `/read <file>` - Read file contents
- `/run <cmd>` - Execute shell command
- `/undo` - Undo last file change
- `/diff` - Show recent changes
- `/context` - Show project context
- `/tokens` - Show token usage
- `/clear` - Clear conversation
- `/exit` - Exit chat

### Project Templates

```bash
# List available templates
termagent init

# Create a new project
termagent init node      # Node.js project
termagent init python    # Python project
termagent init react     # React + Vite
termagent init express   # Express.js API
termagent init cli       # CLI tool
```

### Undo System

```bash
# Show recent file changes
termagent changes

# Undo last file change
termagent undo
```

### Session Management

```bash
# View session history
termagent history

# Start new session
termagent new

# Continue with context
termagent -c "Now add error handling"
```

### Configuration

```bash
# Configure API keys interactively
termagent config

# List available providers
termagent providers

# Test connection
termagent --test
```

## 🛠️ Available Tools

TermAgent can use these tools to help with your coding tasks:

### File Operations

- `read_file` - Read file contents
- `write_file` - Create or overwrite files (with undo)
- `edit_file` - Search and replace in files (with undo)
- `list_directory` - List directory contents
- `find_files` - Search files by pattern
- `delete_file` - Remove files (with undo)
- `rename_file` - Rename or move files

### Shell Commands

- `run_command` - Execute shell commands (with safety checks)

### Code Search

- `grep_search` - Search for patterns in code
- `find_definition` - Find function/class definitions

### Git Operations

- `git_status` - Check repository status
- `git_diff` - Show file changes
- `git_log` - View commit history
- `git_branch` - List/manage branches
- `git_show` - Show commit details

## 🔒 Security

- API keys stored securely in `~/.termagent/`
- Dangerous commands require confirmation
- File changes are backed up and can be undone
- No data sent to third parties except chosen AI provider

## 📁 Project Structure

```
termagent/
├── src/
│   ├── cli.js           # CLI entry point
│   ├── agent/           # AI agent controller
│   ├── config/          # Configuration
│   ├── conversation/    # Session management
│   ├── providers/       # AI providers (5 total)
│   ├── tools/           # Agent tools
│   └── utils/           # Chat, undo, templates, context
├── package.json
└── README.md
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

Made with ❤️ for Termux users

# 🤖 TermAgent

**AI Coding Agent for Termux** - A powerful terminal-based AI coding assistant
with multi-provider support.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## ✨ Features

- **Multi-Provider Support** - OpenAI, Anthropic (Claude), Google (Gemini),
  Groq, Z.AI
- **File Operations** - Read, write, edit, search files
- **Shell Execution** - Run commands with safety checks
- **Code Search** - Grep patterns and find definitions
- **Git Integration** - Status, diff, log, branch operations
- **Session Management** - Continue previous conversations
- **Beautiful CLI** - Colored output, spinners, and detailed tool feedback

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
- `write_file` - Create or overwrite files
- `edit_file` - Search and replace in files
- `list_directory` - List directory contents
- `find_files` - Search files by pattern
- `delete_file` - Remove files
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

- API keys are stored securely in `~/.termagent/`
- Dangerous commands require confirmation (rm -rf, sudo, etc.)
- No data sent to third parties except your chosen AI provider

## 📁 Project Structure

```
termagent/
├── src/
│   ├── cli.js           # CLI entry point
│   ├── index.js         # Main export
│   ├── agent/           # AI agent controller
│   ├── config/          # Configuration management
│   ├── conversation/    # Session management
│   ├── providers/       # AI provider implementations
│   ├── tools/           # Agent tools (file, shell, git, search)
│   └── ui/              # Ink TUI components
├── package.json
└── README.md
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

Made with ❤️ for Termux users

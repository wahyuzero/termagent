# 🤖 TermAgent

**AI Coding Agent for Terminal** - A ~~powerful~~ *somewhat functional* AI assistant that can read, write, and execute code directly in your terminal. Built with 2 hands, remaining brain cells, coffee, and questionable life choices.

![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue)
![Tested On](https://img.shields.io/badge/Tested%20On-Potato%20Phone-orange)

## ✨ Features

- 🔌 **Multi-Provider Support** - Groq, Gemini, Mistral, OpenRouter, ZAI, OpenAI, Anthropic
- 🛠️ **Tool Execution** - Read/write files, run commands, search code
- 💬 **Interactive Chat** - Conversational coding with context awareness
- 📝 **Session Management** - Save and continue conversations
- ⚡ **Free Tier Friendly** - Works great with free API providers
- 🔐 **Safe by Default** - Command confirmation before dangerous operations
- 🥔 **Potato Phone Tested** - If it runs on Redmi 14C, maybe it runs anywhere

## � Tested Environment

> *"If it works on a potato, maybe it works everywhere"* - Frugal Developer Proverb

- **Device**: Redmi 14C (yes, that budget phone your uncle and cousin has)
- **Environment**: Termux
- **Node.js**: v24
- **Tested Models**: Llama 3.3, GLM-4, Deepseek
- **Other models**: *You test them yourself, I'm not your QA team* 🙃

## �🚀 Quick Start

### Installation

Clone repository

```bash
git clone https://github.com/wahyuzero/termagent.git
cd termagent
```

Install dependencies

```bash
npm install
```

Link globally

```bash
npm link
```

### Setup API Key

Get a free API key from one of these providers:

- **Groq** (Recommended): https://console.groq.com
- **Gemini**: https://aistudio.google.com/apikey
- **Mistral**: https://console.mistral.ai
- **OpenRouter**: https://openrouter.ai/keys

```bash
# Set API key
export GROQ_API_KEY="gsk_your_key_here"

# Or run setup wizard
termagent config
```

### Start Chatting

Open folder where you want to chat with agent and run:

```bash
termagent
```

## 📖 Usage

### Commands

| Command        | Shortcut | Description        |
| -------------- | -------- | ------------------ |
| `/help`        | `/h`     | Show help          |
| `/exit`        | `/q`     | Exit chat          |
| `/files`       | `/f`     | List files         |
| `/read <file>` | `/r`     | Read file          |
| `/run <cmd>`   | `/x`     | Run command        |
| `/undo`        | `/u`     | Undo last change   |
| `/diff`        | `/d`     | Show changes       |
| `/tokens`      | `/t`     | Token usage        |
| `/provider`    | `/p`     | Switch provider    |
| `/export`      | `/e`     | Export to markdown |
| `/status`      |          | Session status     |

### Interactive Features

- **Arrow ↑/↓** → Navigate command history
- **Type `a` at confirmation** → Always-allow command for session
- **Git branch in prompt** → Shows current branch (e.g., `main* >`)

### Example Session

```
main* > Create hello.js that print hello world

⛬  Response:
I will create hello.js for you.

   WRITE  (hello.js)
   ↳ File written successfully

main* > Run the file

   RUN  (node hello.js)
   ⚠ Command requires confirmation:
   $ node hello.js
   Allow? (y/n/a=always): y
   ✓ Allowed
   ↳ Hello, World!
```

## 🔧 Supported Providers

### Free Tier

| Provider       | Models                        | Get Key                                                   |
| -------------- | ----------------------------- | --------------------------------------------------------- |
| **Groq**       | Llama 3.3 70B, Mixtral, Gemma | [console.groq.com](https://console.groq.com)              |
| **Gemini**     | Gemini 1.5/2.0 Flash/Pro      | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **Mistral**    | Mistral Small/Large           | [console.mistral.ai](https://console.mistral.ai)          |
| **OpenRouter** | 60+ models                    | [openrouter.ai](https://openrouter.ai/keys)               |

### Paid *(or "free if you know the right people")*

| Provider      | Models                 |
| ------------- | ---------------------- |
| **ZAI**       | GLM-4, GPT-4o-mini, Claude |
| **OpenAI**    | GPT-4o, GPT-4 Turbo    |
| **Anthropic** | Claude 3.5 Sonnet/Opus |

## ⚙️ Configuration

```bash
# Show current config
termagent providers

# Interactive setup
termagent config

# CLI options
termagent -p groq -m llama-3.3-70b-versatile "your message"
termagent --continue  # Continue last session
```

### Environment Variables

```bash
export GROQ_API_KEY="gsk_..."
export GEMINI_API_KEY="..."
export MISTRAL_API_KEY="..."
export OPENROUTER_API_KEY="sk-or-..."
export ZAI_API_KEY="..."
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

## 🛡️ Security

- API keys stored in `~/.termagent/`
- Dangerous commands require confirmation
- Use `a` (always) to auto-allow safe commands per session

## 📋 Requirements

- Node.js 20+ (tested on v24)
- Any terminal with ANSI color support
- A device with at least 2 brain cells worth of RAM

## 🐛 Issues & Support

Found a bug? Have a feature request? Want to complain about life choices?

**Contact**: [frugaldev.biz.id](https://frugaldev.biz.id)

> ⚠️ **Note**: Issues will be addressed *if and when I'm not busy*. No guarantees, no SLA, no refunds. This is free software, what did you expect? 😅

## 📄 License

MIT © wahyuzero

---

*Made with 2 hands and probably too much caffeine*

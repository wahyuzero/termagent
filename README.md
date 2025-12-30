# 🤖 TermAgent

**AI Coding Agent for Terminal** - A ~~powerful~~ _somewhat functional_ AI
assistant that can read, write, and execute code directly in your terminal.
Built with 2 hands, remaining brain cells, coffee, and questionable life
choices.

> 🎯 **The poor man's Claude Code** - Because $20/month is basically a whole
> week of my food budget

![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue)
![Tested On](https://img.shields.io/badge/Tested%20On-Potato%20Phone-orange)
![RAM Required](https://img.shields.io/badge/RAM-2GB%20minimum-red)

## ✨ Features

### Core Features

- 🔌 **Multi-Provider Support** - Groq, Gemini, Mistral, OpenRouter, ZAI,
  OpenAI, Anthropic
- 💬 **Interactive Chat** - Conversational coding with context awareness
- 📝 **Session Management** - Save and continue conversations
- ⚡ **Free Tier Friendly** - Works great with free API providers
- 🔐 **Safe by Default** - Command confirmation before dangerous operations
- 🔄 **Auto-Continue** - AI automatically continues long tasks

### v1.1.0 - New Features 🆕

| Feature             | Description                               | Potato Risk 🥔 |
| ------------------- | ----------------------------------------- | -------------- |
| **MCP Integration** | Model Context Protocol support            | ⚠️ Medium      |
| **Plugin System**   | Custom tools from `~/.termagent/plugins/` | ✅ Safe        |
| **Docker Tools**    | Container management                      | 💀 HIGH        |
| **Security Tools**  | Audit, hash, secret scanning              | ✅ Safe        |
| **HTTP Testing**    | API testing & URL checking                | ✅ Safe        |
| **Test Runner**     | Jest, PyTest, Mocha support               | ⚠️ Medium      |
| **Build Tools**     | npm run build, dev servers                | ⚠️ Medium      |
| **Web Search**      | DuckDuckGo integration                    | ✅ Safe        |
| **Cost Tracking**   | Token & cost estimation                   | ✅ Safe        |
| **LSP Tools**       | Code diagnostics & symbols                | ✅ Safe        |
| **Termux:API**      | Code while scrolling TikTok!              | ✅ Safe        |

## 🥔 Tested Environment

> _"If it works on a potato, maybe it works everywhere"_ - Frugal Developer
> Proverb

- **Device**: Redmi 14C (yes, that budget phone your uncle and cousin has)
- **Environment**: Arch, Ubuntu, Termux (from F-Droid, not that cursed Play
  Store version)
- **Node.js**: v24
- **Primary Testing Model**: ZAI GLM-4.7 _(more on this below)_
- **Also Tested**: Llama 3.3 (Groq), Deepseek
- **Other models**: _You test them yourself, I'm not your QA team_ 🙃

> 🤡 **The Irony Section**
>
> Yes, I mostly tested this with **ZAI** which is a **paid** service that's
> basically Claude Code's Asian cousin. I already had a subscription, so... here
> we are.
>
> _"I paid for a Claude Code alternative, then built a free Claude Code
> alternative"_ — Me, questioning my life choices at 3 AM
>
> The good news: This thing works great with **free** providers like Groq,
> Gemini, and Mistral. So you don't have to repeat my financial mistakes. You're
> welcome. 🎁

## � WARNING: POTATO PHONE USERS READ THIS

> ⚠️ **FEATURES THAT MAY CAUSE YOUR PHONE TO ASCEND TO PHONE HEAVEN**

### 💀 HIGH RISK - May Cause Spontaneous Phone Combustion

| Feature                      | Why It's Dangerous                      | Alternative                   |
| ---------------------------- | --------------------------------------- | ----------------------------- |
| `docker_build`               | Building images = RAM go BRRRR          | Use cloud CI/CD               |
| `docker_compose up`          | Multiple containers = multiple problems | Just... don't                 |
| `project_dev` + Hot Reload   | Watching files = infinite pain          | Use `node server.js` directly |
| `run_tests` on large project | 500 tests = 500 reasons to cry          | Test one file at a time       |
| MCP with 3+ servers          | Each server = subprocess = RAM          | Use 1 server max              |

### ⚠️ MEDIUM RISK - Proceed with Caution

| Feature                 | Symptoms                     | Mitigation                  |
| ----------------------- | ---------------------------- | --------------------------- |
| `npm audit`             | Slow, memory spike           | Close other apps first      |
| `security_audit`        | Scans everything             | Be patient                  |
| `directory_tree` (deep) | Lots of files = lots of RAM  | Limit depth                 |
| Long AI conversations   | Context grows = memory grows | `/new` session periodically |

### ✅ SAFE - Even Grandma's Nokia 3310 Can Handle

- `read_file`, `write_file` - Basic stuff
- `git_status`, `git_diff` - Just text
- `hash_file`, `hash_text` - Math is free
- `http_check` - One request
- `/help`, `/exit` - Literally doing nothing

## 🚀 Quick Start

> 📱 **TERMUX USERS**: Install Termux from **F-Droid**, NOT Google Play Store!
> The Play Store version is abandoned and will cause you nothing but pain and
> suffering.
>
> F-Droid: https://f-droid.org/packages/com.termux/

### Installation

```bash
# First, update and install Node.js
pkg update && pkg install nodejs-lts git

# Then install TermAgent
git clone https://github.com/wahyuzero/termagent.git
cd termagent
npm install
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

# Or run setup
termagent config
```

### Start Chatting

```bash
termagent
```

## 📦 Optional Termux Packages

Some features need extra packages. Install ONLY what you need:

### Essential (Recommended)

```bash
# Already installed if you have Node.js
pkg install nodejs-lts git
```

### For Docker Tools 🐳

> ⚠️ **ABANDON ALL HOPE, YE WHO ENTER HERE**
>
> Docker on Termux is like trying to fit an elephant into a Mini Cooper. It's
> technically possible, but why would you do this to yourself?

**Option 1: The Masochist's Path (Full Docker)** 💀

Follow this guide if you have:

- 3+ hours of free time
- A strong will to live
- Lots of patience
- Perhaps a therapist on speed dial

📖 **Guide**: https://github.com/cyberkernelofficial/docker-in-termux

**Option 2: The Sane Person's Choice (uDocker)** ✅

```bash
# Much simpler, doesn't require root
pkg install udocker

# Then tell the AI to use udocker instead of docker:
# "hey, use udocker instead of docker commands"
# The AI is smart enough to figure it out... probably
```

> 📝 **Note**: uDocker integration not fully tested yet. You're basically a beta
> tester. Congratulations! 🎉

**Option 3: The Smart Choice** 🧠

```bash
# Just use Docker on your PC and SSH into it
pkg install openssh
# Let the potato phone be a potato phone
```

### For Python Projects 🐍

```bash
pkg install python
pip install pytest pip-audit
```

### For Security Scanning 🔒

```bash
# For pip-audit (Python security)
pip install pip-audit

# npm audit works out of the box
```

### For LSP/Code Intelligence 🧠

```bash
# Basic syntax checking - no extra packages needed
# Uses node --check and python -m py_compile
```

### For Build Tools 🔧

```bash
# Most build tools are npm packages
npm install -g typescript webpack vite  # If needed
```

### For MCP (Model Context Protocol) �

```bash
# MCP servers are installed via npx
# Example: npx -y @modelcontextprotocol/server-filesystem /home
```

### For Termux:API 📱

> 🎮 **THE MULTITASKER'S DREAM**
>
> Ever wanted to code while scrolling through TikTok, Instagram, or that
> WhatsApp group that won't stop pinging? Now you can! With Termux:API,
> TermAgent can show Android dialogs for command confirmations. Just tap "Yes"
> or "No" while watching cat videos.
>
> _"Work-life balance achieved"_ — No one ever

```bash
# Install the magic
pkg install termux-api

# ALSO install the Termux:API app from F-Droid
# (Yes, you need both. Don't ask why.)
```

**Features when Termux:API is installed:**

| Feature            | What It Does               | Why You Need It                          |
| ------------------ | -------------------------- | ---------------------------------------- |
| **Confirm Dialog** | Android popup for commands | Approve `rm -rf` while watching reels    |
| **Notifications**  | Alert when tasks complete  | "Your code is done" while in another app |
| **Clipboard**      | AI reads/writes clipboard  | Paste code from Chrome                   |
| **Vibrate**        | Haptic feedback            | Phone buzzes when AI needs attention     |
| **Toast**          | Quick screen messages      | "Task complete!" overlay                 |
| **TTS**            | AI speaks to you           | For when you're too lazy to read         |

**Toggle features with:**

```bash
/termux              # Show status
/termux tts          # Toggle text-to-speech
/termux vibrate      # Toggle vibration  
/termux confirmDialog  # Toggle Android dialogs
/termux notifications # Toggle notifications
/termux clipboard    # Toggle clipboard
/termux toast        # Toggle toast
```

> 💡 **Pro Tip**: Enable `confirmDialog` and run TermAgent in split-screen with
> your social media app. Let AI write your code while you catch up on drama.
> Peak productivity. 📈

## �📖 Usage

### Commands

| Command        | Shortcut | Description         |
| -------------- | -------- | ------------------- |
| `/help`        | `/h`     | Show help           |
| `/exit`        | `/q`     | Exit chat           |
| `/new`         | -        | New session         |
| `/files`       | `/f`     | List files          |
| `/read <file>` | `/r`     | Read file           |
| `/run <cmd>`   | `/x`     | Run command         |
| `/undo`        | `/u`     | Undo last change    |
| `/diff`        | `/d`     | Show changes        |
| `/tokens`      | `/t`     | Token usage         |
| `/provider`    | `/p`     | Switch provider     |
| `/export`      | `/e`     | Export to markdown  |
| `/status`      | -        | Session status      |
| `/termux`      | -        | Termux:API settings |

### Tool Categories

```
📁 File Operations    - read, write, edit, list, find
🐚 Shell Commands     - run_command (with safety checks)
🔍 Search             - grep, code search, definitions
📋 Git                - status, diff, log, commit, branch
🌐 Web                - web_search (DuckDuckGo)
🐳 Docker             - ps, build, run, compose
🔒 Security           - audit, hash, secrets scan
🌍 HTTP               - request, check, headers
🧪 Testing            - run tests, list tests
🔧 Build              - build, dev, install, scripts
🤖 MCP                - connect, list MCP servers
🧩 Plugins            - custom tools from ~/.termagent/plugins/
```

## 🔧 Supported Providers

### Free Tier

| Provider       | Models                        | Get Key                                                   |
| -------------- | ----------------------------- | --------------------------------------------------------- |
| **Groq**       | Llama 3.3 70B, Mixtral, Gemma | [console.groq.com](https://console.groq.com)              |
| **Gemini**     | Gemini 1.5/2.0 Flash/Pro      | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **Mistral**    | Mistral Small/Large           | [console.mistral.ai](https://console.mistral.ai)          |
| **OpenRouter** | 60+ models                    | [openrouter.ai](https://openrouter.ai/keys)               |

### Paid _(or "free if you know the right people")_

| Provider      | Models                     |
| ------------- | -------------------------- |
| **ZAI**       | GLM-4, GPT-4o-mini, Claude |
| **OpenAI**    | GPT-4o, GPT-4 Turbo        |
| **Anthropic** | Claude 3.5 Sonnet/Opus     |

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

### MCP Configuration

Create `~/.termagent/mcp.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"]
    }
  }
}
```

### Plugin Development

Create `~/.termagent/plugins/my-plugin.js`:

```javascript
export const definitions = [{
  name: "my_tool",
  description: "Does something cool",
  parameters: { type: "object", properties: {} },
}];

export async function execute(name, args) {
  return { success: true, message: "Hello from plugin!" };
}
```

## 🛡️ Security

- API keys stored in `~/.termagent/`
- Dangerous commands require confirmation
- Use `a` (always) to auto-allow safe commands per session
- `scan_secrets` can detect API keys in your code

## 📋 Requirements

| Requirement     | Minimum | Recommended |
| --------------- | ------- | ----------- |
| **Node.js**     | 18+     | 20+         |
| **RAM**         | 2 GB    | 4 GB        |
| **Storage**     | 100 MB  | 500 MB      |
| **Brain Cells** | 2       | Any amount  |

## 🐛 Issues & Support

Found a bug? Have a feature request? Want to complain about life choices?

**Contact**: [frugaldev.biz.id](https://frugaldev.biz.id)

> ⚠️ **Note**: Issues will be addressed _if and when I'm not busy_. No
> guarantees, no SLA, no refunds. This is free software, what did you expect? 😅

## 📄 License

MIT © wahyuzero

---

_Made with 2 hands, probably too much caffeine, and the burning desire to not
pay $20/month for Claude Code_

> 🥔 _"My phone is a potato, but at least it's MY potato running an AI agent"_

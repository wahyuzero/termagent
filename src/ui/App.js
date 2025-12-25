import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { createAgent } from '../agent/index.js';
import config from '../config/index.js';

const { createElement: h } = React;

/**
 * Message component
 */
function Message({ role, content }) {
  const colors = {
    user: 'blue',
    assistant: 'green',
    system: 'gray',
    tool: 'yellow',
  };

  const prefixes = {
    user: '▶ You',
    assistant: '● AI',
    system: '◆ System',
    tool: '◇ Tool',
  };

  const displayContent = content.length > 500 ? content.slice(0, 500) + '...' : content;

  return h(Box, { marginBottom: 1 },
    h(Box, { marginRight: 1 },
      h(Text, { color: colors[role], bold: true }, prefixes[role] + ':')
    ),
    h(Box, { flexShrink: 1 },
      h(Text, { wrap: 'wrap' }, displayContent)
    )
  );
}

/**
 * Main TermAgent Application Component
 */
export function App({ initialMessage }) {
  const { exit } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentOutput, setCurrentOutput] = useState('');
  const [toolStatus, setToolStatus] = useState(null);
  const [error, setError] = useState(null);

  const [agent] = useState(() =>
    createAgent({
      onToolCall: (toolCall) => {
        setToolStatus({ type: 'running', name: toolCall.name });
      },
      onToolResult: (name, result) => {
        setToolStatus({
          type: result.error ? 'error' : 'done',
          name,
          error: result.error,
        });
      },
      onConfirmCommand: async () => true,
    })
  );

  useEffect(() => {
    if (initialMessage) {
      handleSubmit(initialMessage);
    }
  }, []);

  const handleSubmit = async (message) => {
    if (!message.trim() || isProcessing) return;

    if (message.startsWith('/')) {
      handleCommand(message);
      return;
    }

    setInput('');
    setIsProcessing(true);
    setCurrentOutput('');
    setToolStatus(null);
    setError(null);

    setMessages((prev) => [...prev, { role: 'user', content: message }]);

    try {
      let assistantContent = '';

      for await (const chunk of agent.chat(message)) {
        if (chunk.type === 'content') {
          assistantContent += chunk.content;
          setCurrentOutput(assistantContent);
        } else if (chunk.type === 'tool_call') {
          setToolStatus({ type: 'running', name: chunk.tool });
        } else if (chunk.type === 'tool_result') {
          setToolStatus({
            type: chunk.result.error ? 'error' : 'done',
            name: chunk.tool,
            result: chunk.result,
          });
        } else if (chunk.type === 'error') {
          setError(chunk.error);
        }
      }

      if (assistantContent) {
        setMessages((prev) => [...prev, { role: 'assistant', content: assistantContent }]);
      }
    } catch (err) {
      setError(err.message);
    }

    setIsProcessing(false);
    setCurrentOutput('');
    setToolStatus(null);
  };

  const handleCommand = (command) => {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'exit':
      case 'quit':
      case 'q':
        exit();
        break;
      case 'clear':
        setMessages([]);
        agent.clearHistory();
        break;
      case 'help':
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: '/help - Show help\n/clear - Clear chat\n/model <name> - Switch model\n/provider <name> - Switch provider\n/exit - Exit',
          },
        ]);
        break;
      case 'model':
        if (args[0]) {
          config.set('model', args[0]);
          setMessages((prev) => [...prev, { role: 'system', content: `Model: ${args[0]}` }]);
        }
        break;
      case 'provider':
        if (args[0]) {
          config.setProvider(args[0]);
          setMessages((prev) => [...prev, { role: 'system', content: `Provider: ${args[0]}` }]);
        }
        break;
      default:
        setMessages((prev) => [...prev, { role: 'system', content: `Unknown: ${cmd}. Use /help` }]);
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  // Build UI using createElement
  const header = h(Box, { borderStyle: 'round', borderColor: 'cyan', paddingX: 1, marginBottom: 1 },
    h(Text, { color: 'cyan', bold: true }, 'TermAgent'),
    h(Text, { color: 'gray' }, ' | '),
    h(Text, { color: 'yellow' }, config.getCurrentProvider()),
    h(Text, { color: 'gray' }, '/'),
    h(Text, { color: 'green' }, config.getCurrentModel())
  );

  const messageList = h(Box, { flexDirection: 'column', marginBottom: 1 },
    ...messages.slice(-10).map((msg, i) =>
      h(Message, { key: i, role: msg.role, content: msg.content })
    )
  );

  const streamingOutput = isProcessing && currentOutput
    ? h(Box, { marginBottom: 1 },
        h(Text, { color: 'green' }, '● '),
        h(Text, null, currentOutput)
      )
    : null;

  const toolStatusDisplay = toolStatus
    ? h(Box, { marginBottom: 1 },
        toolStatus.type === 'running'
          ? [h(Text, { color: 'yellow', key: 's' }, h(Spinner, { type: 'dots' })),
             h(Text, { color: 'yellow', key: 't' }, ` Running: ${toolStatus.name}`)]
          : toolStatus.type === 'done'
            ? h(Text, { color: 'green' }, `✓ ${toolStatus.name} completed`)
            : h(Text, { color: 'red' }, `✗ ${toolStatus.name} failed: ${toolStatus.error}`)
      )
    : null;

  const errorDisplay = error
    ? h(Box, { marginBottom: 1 }, h(Text, { color: 'red' }, `Error: ${error}`))
    : null;

  const inputBox = h(Box, { borderStyle: 'round', borderColor: isProcessing ? 'gray' : 'green', paddingX: 1 },
    h(Text, { color: 'green' }, '> '),
    isProcessing
      ? h(Text, { color: 'gray' }, 'Processing...')
      : h(TextInput, {
          value: input,
          onChange: setInput,
          onSubmit: handleSubmit,
          placeholder: 'Type a message or /help...'
        })
  );

  return h(Box, { flexDirection: 'column', padding: 1 },
    header,
    messageList,
    streamingOutput,
    toolStatusDisplay,
    errorDisplay,
    inputBox
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { createAgent } from '../agent/index.js';
import config from '../config/index.js';

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
      onConfirmCommand: async (command, reason) => {
        // For now, auto-approve (in production, should prompt user)
        return true;
      },
    })
  );

  // Process initial message if provided
  useEffect(() => {
    if (initialMessage) {
      handleSubmit(initialMessage);
    }
  }, []);

  const handleSubmit = async (message) => {
    if (!message.trim() || isProcessing) return;

    // Handle commands
    if (message.startsWith('/')) {
      handleCommand(message);
      return;
    }

    setInput('');
    setIsProcessing(true);
    setCurrentOutput('');
    setToolStatus(null);
    setError(null);

    // Add user message
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
        } else if (chunk.type === 'done') {
          // Complete
        }
      }

      // Add assistant message
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
            content: `Available commands:
/help - Show this help
/clear - Clear conversation
/model <name> - Switch model
/provider <name> - Switch provider
/exit - Exit application`,
          },
        ]);
        break;

      case 'model':
        if (args[0]) {
          try {
            config.set('model', args[0]);
            setMessages((prev) => [
              ...prev,
              { role: 'system', content: `Switched to model: ${args[0]}` },
            ]);
          } catch (e) {
            setError(e.message);
          }
        }
        break;

      case 'provider':
        if (args[0]) {
          try {
            config.setProvider(args[0]);
            setMessages((prev) => [
              ...prev,
              { role: 'system', content: `Switched to provider: ${args[0]}` },
            ]);
          } catch (e) {
            setError(e.message);
          }
        }
        break;

      default:
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: `Unknown command: ${cmd}. Type /help for available commands.` },
        ]);
    }
  };

  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text color="cyan" bold>
          TermAgent
        </Text>
        <Text color="gray"> | </Text>
        <Text color="yellow">{config.getCurrentProvider()}</Text>
        <Text color="gray">/</Text>
        <Text color="green">{config.getCurrentModel()}</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.slice(-10).map((msg, i) => (
          <Message key={i} role={msg.role} content={msg.content} />
        ))}
      </Box>

      {/* Current streaming output */}
      {isProcessing && currentOutput && (
        <Box marginBottom={1}>
          <Text color="green">● </Text>
          <Text>{currentOutput}</Text>
        </Box>
      )}

      {/* Tool status */}
      {toolStatus && (
        <Box marginBottom={1}>
          {toolStatus.type === 'running' ? (
            <>
              <Text color="yellow">
                <Spinner type="dots" />
              </Text>
              <Text color="yellow"> Running: {toolStatus.name}</Text>
            </>
          ) : toolStatus.type === 'done' ? (
            <Text color="green">✓ {toolStatus.name} completed</Text>
          ) : (
            <Text color="red">✗ {toolStatus.name} failed: {toolStatus.error}</Text>
          )}
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Input */}
      <Box borderStyle="round" borderColor={isProcessing ? 'gray' : 'green'} paddingX={1}>
        <Text color="green">&gt; </Text>
        {isProcessing ? (
          <Text color="gray">Processing...</Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type a message or /help for commands..."
          />
        )}
      </Box>
    </Box>
  );
}

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

  // Truncate long messages for display
  const displayContent = content.length > 500 ? content.slice(0, 500) + '...' : content;

  return (
    <Box marginBottom={1}>
      <Box marginRight={1}>
        <Text color={colors[role]} bold>
          {prefixes[role]}:
        </Text>
      </Box>
      <Box flexShrink={1}>
        <Text wrap="wrap">{displayContent}</Text>
      </Box>
    </Box>
  );
}

export default App;

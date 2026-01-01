import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Terminal as TerminalIcon } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useFileStore } from '../../store/fileStore';
import { useEditorStore } from '../../store/editorStore';
import { useDiffStore } from '../../store/diffStore';
import { useTerminalStore } from '../../store/terminalStore';
import { webContainer } from '../../lib/webcontainer';
import TaskProgress from '../Chat/TaskProgress';
import ClarifyQuestion from '../Chat/ClarifyQuestion';

const Chat = () => {
    const [input, setInput] = useState('');
    const { messages, addMessage, isLoading, setLoading } = useChatStore();
    const { files, addFile, updateFileContent, getFileContents } = useFileStore();
    const { openFile } = useEditorStore();
    const { setFileDiff } = useDiffStore();
    const { terminal } = useTerminalStore();
    const messagesEndRef = useRef(null);

    // Agentic state
    const [currentPlan, setCurrentPlan] = useState(null);
    const [executionResults, setExecutionResults] = useState([]);
    const [currentTaskIndex, setCurrentTaskIndex] = useState(-1);
    const [clarification, setClarification] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [pendingCommands, setPendingCommands] = useState([]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, currentPlan, clarification]);

    /**
     * Sync a file to WebContainer, creating parent directories if needed
     */
    const syncFileToWebContainer = async (filePath, content) => {
        try {
            // WebContainer's writeFile now handles directory creation
            await webContainer.writeFile(filePath, content);
            console.log(`✓ Synced to WebContainer: ${filePath}`);
            return true;
        } catch (err) {
            console.error(`✗ Failed to sync ${filePath}:`, err);
            if (terminal) {
                terminal.writeln(`\x1b[1;31m✗ Failed to write file: ${filePath}\x1b[0m`);
            }
            return false;
        }
    };

    /**
     * Run a terminal command and stream output
     */
    const runTerminalCommand = async (command, args = []) => {
        if (terminal) {
            terminal.writeln(`\x1b[1;34m▶ Running: ${command} ${args.join(' ')}\x1b[0m`);
        }

        try {
            const process = await webContainer.spawn(command, args);

            process.output.pipeTo(new WritableStream({
                write(data) {
                    if (terminal) {
                        terminal.write(data);
                    }
                }
            }));

            const exitCode = await process.exit;

            if (terminal) {
                if (exitCode === 0) {
                    terminal.writeln(`\n\x1b[1;32m✓ Command completed successfully\x1b[0m\n`);
                } else {
                    terminal.writeln(`\n\x1b[1;31m✗ Command failed with exit code ${exitCode}\x1b[0m\n`);
                }
            }

            return exitCode === 0;
        } catch (err) {
            console.error('Command execution error:', err);
            if (terminal) {
                terminal.writeln(`\n\x1b[1;31m✗ Error: ${err.message}\x1b[0m\n`);
            }
            return false;
        }
    };

    const applyFileChange = async (result) => {
        if (!result.success || !result.file || !result.content) return;

        const originalContent = files[result.file]?.content || '';
        const isNewFile = !files[result.file];

        // For new files, sync to WebContainer immediately (creates dirs as needed)
        if (isNewFile) {
            addFile(result.file, result.content);
            await syncFileToWebContainer(result.file, result.content);
        }

        // Set diff for the editor to show
        setFileDiff(result.file, originalContent, result.content);

        // Open the file to show the diff
        openFile(result.file);
    };

    const executeTasksSequentially = async (tasks, filesContext) => {
        setIsExecuting(true);
        setCurrentTaskIndex(0);
        const results = [];
        let updatedFiles = { ...filesContext };

        for (let i = 0; i < tasks.length; i++) {
            setCurrentTaskIndex(i);

            const task = tasks[i];
            const taskType = task.type || 'file'; // Default to file for backward compatibility

            try {
                if (taskType === 'command') {
                    // Handle terminal command execution
                    let command = task.command || '';

                    // Auto-fix npx commands: ensure -y flag is present to avoid interactive prompts
                    if (command.startsWith('npx ') && !command.includes(' -y ') && !command.includes(' -y')) {
                        // Insert -y after 'npx '
                        command = 'npx -y ' + command.slice(4);
                        console.log(`Auto-fixed npx command: ${command}`);
                    }

                    const commandParts = command.split(' ');
                    const cmd = commandParts[0];
                    const args = commandParts.slice(1);

                    if (terminal) {
                        terminal.writeln(`\n\x1b[1;33m📦 Task ${i + 1}: ${task.description}\x1b[0m`);
                    }

                    const success = await runTerminalCommand(cmd, args);

                    results.push({
                        success,
                        type: 'command',
                        command: task.command,
                        description: task.description
                    });
                    setExecutionResults([...results]);

                    // Small delay between tasks
                    await new Promise(resolve => setTimeout(resolve, 300));

                } else {
                    // Handle file operations (default)

                    // Normalize file path - ensure it starts with src/
                    let filePath = task.file || '';
                    if (filePath && !filePath.startsWith('src/') && !filePath.includes('package.json') && !filePath.includes('vite.config') && !filePath.includes('tailwind.config') && !filePath.includes('index.html')) {
                        // Auto-fix: add src/ prefix for source files
                        if (filePath.startsWith('components/')) {
                            filePath = `src/${filePath}`;
                        } else if (filePath.endsWith('.jsx') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
                            filePath = `src/${filePath}`;
                        }
                        console.log(`Auto-fixed file path: ${task.file} -> ${filePath}`);
                        task.file = filePath;
                    }

                    const currentContent = updatedFiles[task.file] || '';

                    const response = await fetch('http://localhost:8000/api/execute-task', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            task,
                            currentContent
                        })
                    });

                    const result = await response.json();
                    results.push(result);
                    setExecutionResults([...results]);

                    if (result.success && result.content) {
                        updatedFiles[result.file] = result.content;

                        // Apply the change (shows in diff view)
                        await applyFileChange(result);

                        // Small delay to let user see each change
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } catch (error) {
                results.push({
                    success: false,
                    file: task.file,
                    command: task.command,
                    error: error.message
                });
                setExecutionResults([...results]);
            }
        }

        setIsExecuting(false);
        setCurrentTaskIndex(-1);

        addMessage('assistant', `✅ Completed ${results.filter(r => r.success).length}/${tasks.length} tasks. Review the changes in the editor.`);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading || isExecuting) return;

        const userMessage = input.trim();
        setInput('');
        addMessage('user', userMessage);
        setLoading(true);
        setCurrentPlan(null);
        setExecutionResults([]);
        setClarification(null);

        try {
            const currentFiles = getFileContents();

            // First, get the plan
            const planResponse = await fetch('http://localhost:8000/api/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request: userMessage,
                    currentFiles
                })
            });

            const plan = await planResponse.json();

            if (plan.error) {
                // Check if it's a rate limit error
                const errorStr = plan.error.toLowerCase();
                if (errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('rate')) {
                    addMessage('assistant', `⏳ Rate limit reached. The system is automatically retrying with backup API keys. Please wait a moment and try again.`);
                } else {
                    addMessage('assistant', `Error: ${plan.error}`);
                }
                setLoading(false);
                return;
            }

            // Check if clarification needed
            if (plan.needs_clarification) {
                setClarification({
                    question: plan.clarification_question,
                    understanding: plan.understanding
                });
                setLoading(false);
                return;
            }

            // Show the plan
            setCurrentPlan(plan);

            if (plan.tasks && plan.tasks.length > 0) {
                addMessage('assistant', `📋 Created a plan with ${plan.tasks.length} task(s). Executing...`);
                setLoading(false);

                // Execute tasks one by one
                await executeTasksSequentially(plan.tasks, currentFiles);
            } else {
                addMessage('assistant', plan.understanding || 'No tasks generated. Try being more specific.');
                setLoading(false);
            }

        } catch (error) {
            console.error('Chat error:', error);
            addMessage('assistant', `Error: ${error.message}`);
            setLoading(false);
        }
    };

    const handleClarificationSubmit = async (response) => {
        addMessage('user', response);
        setLoading(true);
        setClarification(null);

        try {
            const currentFiles = getFileContents();

            const clarifyResponse = await fetch('http://localhost:8000/api/clarify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response })
            });

            const plan = await clarifyResponse.json();

            if (plan.needs_clarification) {
                setClarification({
                    question: plan.clarification_question,
                    understanding: plan.understanding
                });
                setLoading(false);
                return;
            }

            setCurrentPlan(plan);

            if (plan.tasks && plan.tasks.length > 0) {
                addMessage('assistant', `📋 Created a plan with ${plan.tasks.length} task(s). Executing...`);
                setLoading(false);
                await executeTasksSequentially(plan.tasks, currentFiles);
            } else {
                addMessage('assistant', plan.understanding || 'No tasks generated.');
                setLoading(false);
            }

        } catch (error) {
            addMessage('assistant', `Error: ${error.message}`);
            setLoading(false);
        }
    };

    const handleClarificationSkip = () => {
        setClarification(null);
        addMessage('assistant', 'Clarification skipped. Let me try with my current understanding.');
        // Could trigger execution with current understanding here
    };

    return (
        <div className="flex flex-col h-full bg-[#181818]">
            {/* Header */}
            <div className="p-3 border-b border-gray-700 flex items-center space-x-2">
                <Sparkles size={16} className="text-purple-400" />
                <span className="text-sm font-semibold text-gray-300">AI Agent</span>
                {isExecuting && (
                    <span className="text-xs text-yellow-400 ml-auto flex items-center">
                        <Loader2 size={12} className="animate-spin mr-1" />
                        Executing...
                    </span>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm py-8">
                        <Bot size={32} className="mx-auto mb-2 text-gray-600" />
                        <p className="mb-2">I'm your AI coding assistant!</p>
                        <p className="text-xs text-gray-600">
                            Try: "Build a todo app with add, delete, and filter"
                        </p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex items-start space-x-2 max-w-[95%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                                <div className={`p-1.5 rounded-full flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                                    {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                                </div>
                                <div className={`rounded-lg p-3 text-sm ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-[#2a2a2a] text-gray-200 border border-gray-700'
                                    }`}>
                                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {/* Task Progress */}
                {currentPlan && (
                    <TaskProgress
                        plan={currentPlan}
                        results={executionResults}
                        currentTaskIndex={currentTaskIndex}
                    />
                )}

                {/* Clarification Question */}
                {clarification && (
                    <ClarifyQuestion
                        question={clarification.question}
                        understanding={clarification.understanding}
                        onSubmit={handleClarificationSubmit}
                        onSkip={handleClarificationSkip}
                    />
                )}

                {/* Loading */}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="flex items-center space-x-2 bg-[#2a2a2a] text-gray-400 rounded-lg p-3 border border-gray-700">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-sm">Planning...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Describe what you want to build..."
                        disabled={isLoading || isExecuting}
                        className="w-full bg-[#2a2a2a] text-white rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || isExecuting || !input.trim()}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Chat;

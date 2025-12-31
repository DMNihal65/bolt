import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Check, X, FileCode, Terminal as TerminalIcon, Loader2 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useFileStore } from '../../store/fileStore';
import { useEditorStore } from '../../store/editorStore';
import { webContainer } from '../../lib/webcontainer';

const FileChange = ({ file, onAccept, onReject }) => {
    const getActionColor = (action) => {
        switch (action) {
            case 'create': return 'text-green-400 bg-green-900/30';
            case 'update': return 'text-yellow-400 bg-yellow-900/30';
            case 'delete': return 'text-red-400 bg-red-900/30';
            default: return 'text-gray-400 bg-gray-900/30';
        }
    };

    return (
        <div className="border border-gray-700 rounded-lg overflow-hidden mb-2">
            <div className={`flex items-center justify-between px-3 py-2 ${getActionColor(file.action)}`}>
                <div className="flex items-center space-x-2">
                    <FileCode size={14} />
                    <span className="text-sm font-mono">{file.path}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-black/30">{file.action}</span>
                </div>
                <div className="flex items-center space-x-1">
                    <button
                        onClick={() => onAccept(file)}
                        className="p-1 hover:bg-green-600 rounded text-green-400 hover:text-white"
                        title="Accept change"
                    >
                        <Check size={14} />
                    </button>
                    <button
                        onClick={() => onReject(file)}
                        className="p-1 hover:bg-red-600 rounded text-red-400 hover:text-white"
                        title="Reject change"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>
            {file.content && (
                <pre className="p-2 text-xs bg-[#0d0d0d] text-gray-300 max-h-32 overflow-auto font-mono">
                    {file.content.slice(0, 500)}{file.content.length > 500 ? '...' : ''}
                </pre>
            )}
        </div>
    );
};

const PendingChanges = ({ changes, onAcceptAll, onRejectAll, onAcceptFile, onRejectFile }) => {
    if (!changes || !changes.files || changes.files.length === 0) return null;

    return (
        <div className="border-t border-gray-700 p-3 bg-[#1a1a2e]">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                    <FileCode size={16} className="text-blue-400" />
                    <span className="text-sm font-semibold text-white">
                        {changes.files.length} file{changes.files.length > 1 ? 's' : ''} to change
                    </span>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={onAcceptAll}
                        className="flex items-center space-x-1 px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs text-white"
                    >
                        <Check size={12} />
                        <span>Accept All</span>
                    </button>
                    <button
                        onClick={onRejectAll}
                        className="flex items-center space-x-1 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs text-white"
                    >
                        <X size={12} />
                        <span>Reject All</span>
                    </button>
                </div>
            </div>

            {changes.thinking && (
                <p className="text-xs text-gray-400 mb-2 italic">{changes.thinking}</p>
            )}

            <div className="max-h-64 overflow-y-auto">
                {changes.files.map((file, idx) => (
                    <FileChange
                        key={`${file.path}-${idx}`}
                        file={file}
                        onAccept={onAcceptFile}
                        onReject={onRejectFile}
                    />
                ))}
            </div>

            {changes.commands && changes.commands.length > 0 && (
                <div className="mt-3 p-2 bg-[#0d0d0d] rounded border border-gray-700">
                    <div className="flex items-center space-x-2 text-xs text-gray-400 mb-1">
                        <TerminalIcon size={12} />
                        <span>Commands to run:</span>
                    </div>
                    {changes.commands.map((cmd, idx) => (
                        <code key={idx} className="block text-xs text-green-400 font-mono">{cmd}</code>
                    ))}
                </div>
            )}
        </div>
    );
};

const Chat = () => {
    const [input, setInput] = useState('');
    const { messages, addMessage, isLoading, setLoading, pendingChanges, setPendingChanges, clearPendingChanges } = useChatStore();
    const { files, addFile, updateFileContent, deleteFile, getFileContents } = useFileStore();
    const { openFile } = useEditorStore();
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, pendingChanges]);

    const applyFileChange = async (file) => {
        try {
            if (file.action === 'delete') {
                deleteFile(file.path);
                await webContainer.instance?.fs.rm(file.path);
            } else {
                // Create or update
                if (file.action === 'create') {
                    addFile(file.path, file.content);
                } else {
                    updateFileContent(file.path, file.content);
                }
                await webContainer.writeFile(file.path, file.content);
                openFile(file.path);
            }
            return true;
        } catch (error) {
            console.error('Failed to apply file change:', error);
            return false;
        }
    };

    const handleAcceptAll = async () => {
        if (!pendingChanges) return;

        for (const file of pendingChanges.files) {
            await applyFileChange(file);
        }

        // Run commands if any
        if (pendingChanges.commands && pendingChanges.commands.length > 0) {
            for (const cmd of pendingChanges.commands) {
                const [command, ...args] = cmd.split(' ');
                try {
                    const process = await webContainer.spawn(command, args);
                    // Let terminal handle output
                } catch (e) {
                    console.error('Command failed:', e);
                }
            }
        }

        addMessage('assistant', `✅ Applied ${pendingChanges.files.length} file change(s)`);
        clearPendingChanges();
    };

    const handleRejectAll = () => {
        addMessage('assistant', '❌ Changes rejected');
        clearPendingChanges();
    };

    const handleAcceptFile = async (file) => {
        await applyFileChange(file);

        // Remove from pending
        const remaining = pendingChanges.files.filter(f => f.path !== file.path);
        if (remaining.length === 0) {
            clearPendingChanges();
            addMessage('assistant', '✅ All changes applied');
        } else {
            setPendingChanges({ ...pendingChanges, files: remaining });
        }
    };

    const handleRejectFile = (file) => {
        const remaining = pendingChanges.files.filter(f => f.path !== file.path);
        if (remaining.length === 0) {
            clearPendingChanges();
        } else {
            setPendingChanges({ ...pendingChanges, files: remaining });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        addMessage('user', userMessage);
        setLoading(true);

        try {
            // Get current file contents for context
            const currentFiles = getFileContents();

            const response = await fetch('http://localhost:8000/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, { role: 'user', content: userMessage }],
                    currentFiles
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            // Check if we have file changes
            if (result.files && result.files.length > 0) {
                setPendingChanges(result);
                if (result.message) {
                    addMessage('assistant', result.message);
                }
            } else if (result.message) {
                addMessage('assistant', result.message);
            } else {
                addMessage('assistant', 'No changes generated. Try being more specific about what you want to build.');
            }

        } catch (error) {
            console.error('Chat error:', error);
            addMessage('assistant', `Error: ${error.message}. Make sure the backend is running.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#181818]">
            {/* Header */}
            <div className="p-3 border-b border-gray-700 flex items-center space-x-2">
                <Bot size={16} className="text-blue-400" />
                <span className="text-sm font-semibold text-gray-300">AI Code Generator</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm py-8">
                        <Bot size={32} className="mx-auto mb-2 text-gray-600" />
                        <p className="mb-2">I can help you build web apps!</p>
                        <p className="text-xs text-gray-600">Try: "Create a counter app" or "Add a dark theme toggle"</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex items-start space-x-2 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                                <div className={`p-1.5 rounded-full flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-600'}`}>
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

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="flex items-center space-x-2 bg-[#2a2a2a] text-gray-400 rounded-lg p-3 border border-gray-700">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-sm">Generating code...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Pending Changes */}
            <PendingChanges
                changes={pendingChanges}
                onAcceptAll={handleAcceptAll}
                onRejectAll={handleRejectAll}
                onAcceptFile={handleAcceptFile}
                onRejectFile={handleRejectFile}
            />

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Describe what you want to build..."
                        disabled={isLoading}
                        className="w-full bg-[#2a2a2a] text-white rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
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

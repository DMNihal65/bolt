import React, { useState, useRef, useEffect } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useEditorStore } from '../../store/editorStore';
import { useFileStore } from '../../store/fileStore';
import { useDiffStore } from '../../store/diffStore';
import { webContainer } from '../../lib/webcontainer';
import { X, Check, XCircle, GitCompare, Code } from 'lucide-react';

// Helper to detect language from filename
const getLanguage = (filename) => {
    if (!filename) return 'plaintext';
    const ext = filename.split('.').pop().toLowerCase();
    const languageMap = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        json: 'json',
        html: 'html',
        css: 'css',
        md: 'markdown',
        py: 'python',
    };
    return languageMap[ext] || 'plaintext';
};

const CodeEditor = () => {
    const { activeFile, openFiles, closeFile, setActiveFile } = useEditorStore();
    const { files, updateFileContent } = useFileStore();
    const { pendingDiffs, getDiff, acceptDiff, rejectDiff, removeDiff, hasPendingDiff } = useDiffStore();
    const [showDiff, setShowDiff] = useState(false);
    const editorRef = useRef(null);

    // Check if active file has pending diff
    const activeDiff = activeFile ? getDiff(activeFile) : null;
    const hasActiveDiff = activeDiff && activeDiff.status === 'pending';

    // Auto-show diff when there's a pending change
    useEffect(() => {
        if (hasActiveDiff) {
            setShowDiff(true);
        }
    }, [hasActiveDiff, activeFile]);

    const handleEditorChange = (value) => {
        if (activeFile && value !== undefined && !showDiff) {
            updateFileContent(activeFile, value);
            // Sync to WebContainer
            webContainer.writeFile(activeFile, value).catch(err => {
                console.error('Failed to write file to WebContainer:', err);
            });
        }
    };

    const handleAcceptDiff = async () => {
        if (!activeFile || !activeDiff) return;

        // Apply the proposed changes
        updateFileContent(activeFile, activeDiff.proposed);
        await webContainer.writeFile(activeFile, activeDiff.proposed);

        acceptDiff(activeFile);
        removeDiff(activeFile);
        setShowDiff(false);
    };

    const handleRejectDiff = () => {
        if (!activeFile) return;
        rejectDiff(activeFile);
        removeDiff(activeFile);
        setShowDiff(false);
    };

    // Count pending diffs
    const pendingCount = Object.keys(pendingDiffs).filter(
        path => pendingDiffs[path].status === 'pending'
    ).length;

    return (
        <div className="h-full w-full flex flex-col bg-[#1e1e1e]">
            {/* Tabs */}
            <div className="flex items-center bg-[#252526] border-b border-gray-700">
                <div className="flex-1 flex overflow-x-auto">
                    {openFiles.map((filePath) => {
                        const hasDiff = hasPendingDiff(filePath);
                        return (
                            <div
                                key={filePath}
                                className={`flex items-center px-3 py-2 text-sm cursor-pointer border-r border-gray-700 min-w-0 group ${activeFile === filePath
                                        ? 'bg-[#1e1e1e] text-white'
                                        : 'text-gray-400 hover:bg-[#2d2d2d]'
                                    }`}
                                onClick={() => setActiveFile(filePath)}
                            >
                                {hasDiff && (
                                    <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2 animate-pulse" />
                                )}
                                <span className="truncate max-w-[120px]">{filePath.split('/').pop()}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeFile(filePath);
                                    }}
                                    className="ml-2 p-0.5 hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Diff toggle and count */}
                {pendingCount > 0 && (
                    <div className="flex items-center px-2 space-x-2">
                        <span className="text-xs text-yellow-400">
                            {pendingCount} pending
                        </span>
                        <button
                            onClick={() => setShowDiff(!showDiff)}
                            className={`p-1.5 rounded ${showDiff ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
                            title={showDiff ? 'Show editor' : 'Show diff'}
                        >
                            {showDiff ? <Code size={14} /> : <GitCompare size={14} />}
                        </button>
                    </div>
                )}
            </div>

            {/* Diff Action Bar */}
            {hasActiveDiff && showDiff && (
                <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-gray-700">
                    <div className="flex items-center space-x-2 text-sm">
                        <GitCompare size={14} className="text-yellow-400" />
                        <span className="text-gray-300">Reviewing changes for</span>
                        <code className="bg-gray-800 px-2 py-0.5 rounded text-yellow-400">
                            {activeFile}
                        </code>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={handleAcceptDiff}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm text-white"
                        >
                            <Check size={14} />
                            <span>Accept</span>
                        </button>
                        <button
                            onClick={handleRejectDiff}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm text-white"
                        >
                            <XCircle size={14} />
                            <span>Reject</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Editor */}
            <div className="flex-1">
                {activeFile ? (
                    hasActiveDiff && showDiff ? (
                        // Diff Editor View
                        <DiffEditor
                            height="100%"
                            theme="vs-dark"
                            language={getLanguage(activeFile)}
                            original={activeDiff.original || ''}
                            modified={activeDiff.proposed || ''}
                            options={{
                                readOnly: true,
                                renderSideBySide: true,
                                minimap: { enabled: false },
                                fontSize: 14,
                                wordWrap: 'on',
                                automaticLayout: true,
                                scrollBeyondLastLine: false,
                            }}
                        />
                    ) : (
                        // Regular Editor View
                        <Editor
                            height="100%"
                            theme="vs-dark"
                            path={activeFile}
                            language={getLanguage(activeFile)}
                            value={files[activeFile]?.content || ''}
                            onChange={handleEditorChange}
                            onMount={(editor) => {
                                editorRef.current = editor;
                            }}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                wordWrap: 'on',
                                automaticLayout: true,
                                scrollBeyondLastLine: false,
                                lineNumbers: 'on',
                                renderWhitespace: 'selection',
                                tabSize: 2,
                            }}
                        />
                    )
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                            <p className="text-lg mb-2">No file selected</p>
                            <p className="text-sm">Select a file from the explorer to start editing</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CodeEditor;

import React from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../store/editorStore';
import { useFileStore } from '../../store/fileStore';
import { webContainer } from '../../lib/webcontainer';
import { X } from 'lucide-react';

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

    const handleEditorChange = (value) => {
        if (activeFile && value !== undefined) {
            updateFileContent(activeFile, value);
            // Sync to WebContainer
            webContainer.writeFile(activeFile, value).catch(err => {
                console.error('Failed to write file to WebContainer:', err);
            });
        }
    };

    return (
        <div className="h-full w-full flex flex-col bg-[#1e1e1e]">
            {/* Tabs */}
            <div className="flex bg-[#252526] border-b border-gray-700 overflow-x-auto">
                {openFiles.map((filePath) => (
                    <div
                        key={filePath}
                        className={`flex items-center px-3 py-2 text-sm cursor-pointer border-r border-gray-700 min-w-0 ${activeFile === filePath
                                ? 'bg-[#1e1e1e] text-white'
                                : 'text-gray-400 hover:bg-[#2d2d2d]'
                            }`}
                        onClick={() => setActiveFile(filePath)}
                    >
                        <span className="truncate max-w-[120px]">{filePath.split('/').pop()}</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                closeFile(filePath);
                            }}
                            className="ml-2 p-0.5 hover:bg-gray-600 rounded"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Editor */}
            <div className="flex-1">
                {activeFile ? (
                    <Editor
                        height="100%"
                        theme="vs-dark"
                        path={activeFile}
                        language={getLanguage(activeFile)}
                        value={files[activeFile]?.content || ''}
                        onChange={handleEditorChange}
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

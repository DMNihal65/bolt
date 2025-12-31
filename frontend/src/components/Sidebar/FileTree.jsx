import React, { useState } from 'react';
import { useFileStore } from '../../store/fileStore';
import { useEditorStore } from '../../store/editorStore';
import { File, Folder, ChevronRight, ChevronDown, Plus, FilePlus } from 'lucide-react';

const FileTreeItem = ({ name, path, isExpanded, onToggle, onSelect, isActive }) => {
    return (
        <div
            className={`flex items-center py-1.5 px-2 cursor-pointer text-sm transition-colors ${isActive ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                }`}
            onClick={() => onSelect(path)}
        >
            <File size={14} className="mr-2 text-gray-400 flex-shrink-0" />
            <span className="truncate">{name}</span>
        </div>
    );
};

const FileTree = () => {
    const { files } = useFileStore();
    const { openFile, activeFile } = useEditorStore();
    const [newFileName, setNewFileName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const { addFile } = useFileStore();

    const fileList = Object.keys(files).map(path => ({
        name: path.split('/').pop(),
        path,
    }));

    const handleCreateFile = () => {
        if (newFileName.trim()) {
            addFile(newFileName.trim(), '// New file\n');
            openFile(newFileName.trim());
            setNewFileName('');
            setIsCreating(false);
        }
    };

    return (
        <div className="h-full bg-[#181818] flex flex-col">
            {/* Header */}
            <div className="p-3 flex items-center justify-between border-b border-gray-700">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Explorer</span>
                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                >
                    <FilePlus size={14} />
                </button>
            </div>

            {/* New File Input */}
            {isCreating && (
                <div className="px-2 py-2 border-b border-gray-700">
                    <input
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                        placeholder="filename.js"
                        className="w-full bg-[#2a2a2a] text-white text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                    />
                </div>
            )}

            {/* File List */}
            <div className="flex-1 overflow-y-auto py-1">
                {fileList.length === 0 ? (
                    <div className="px-3 py-4 text-gray-500 text-sm text-center">
                        No files yet
                    </div>
                ) : (
                    fileList.map((file) => (
                        <FileTreeItem
                            key={file.path}
                            name={file.name}
                            path={file.path}
                            onSelect={openFile}
                            isActive={activeFile === file.path}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default FileTree;

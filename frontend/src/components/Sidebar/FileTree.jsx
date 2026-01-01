import React, { useState } from 'react';
import { useFileStore } from '../../store/fileStore';
import { useEditorStore } from '../../store/editorStore';
import { webContainer } from '../../lib/webcontainer';
import { File, Folder, ChevronRight, ChevronDown, FilePlus, FolderPlus, Trash2 } from 'lucide-react';

// Get file icon color based on extension
const getFileIconColor = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    const colors = {
        jsx: 'text-blue-400',
        js: 'text-yellow-400',
        ts: 'text-blue-500',
        tsx: 'text-blue-500',
        css: 'text-purple-400',
        html: 'text-orange-400',
        json: 'text-yellow-300',
        md: 'text-gray-400',
    };
    return colors[ext] || 'text-gray-400';
};

// Recursive TreeNode component
const TreeNode = ({ name, node, path, level, openFile, activeFile, deleteFile, expandedFolders, toggleFolder }) => {
    const isExpanded = expandedFolders.has(path);
    const paddingLeft = level * 12;

    if (node.type === 'file') {
        const isActive = activeFile === node.path;
        return (
            <div
                className={`flex items-center py-1 px-2 cursor-pointer text-sm transition-colors group ${isActive ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                    }`}
                style={{ paddingLeft: `${paddingLeft + 8}px` }}
                onClick={() => openFile(node.path)}
            >
                <File size={14} className={`mr-2 flex-shrink-0 ${getFileIconColor(name)}`} />
                <span className="truncate flex-1">{name}</span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(node.path);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-600/50 rounded"
                >
                    <Trash2 size={12} className="text-red-400" />
                </button>
            </div>
        );
    }

    // It's a folder
    return (
        <div>
            <div
                className="flex items-center py-1 px-2 cursor-pointer text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                style={{ paddingLeft: `${paddingLeft}px` }}
                onClick={() => toggleFolder(path)}
            >
                {isExpanded ? (
                    <ChevronDown size={14} className="mr-1 text-gray-500 flex-shrink-0" />
                ) : (
                    <ChevronRight size={14} className="mr-1 text-gray-500 flex-shrink-0" />
                )}
                <Folder size={14} className="mr-2 text-yellow-400 flex-shrink-0" />
                <span className="truncate">{name}</span>
            </div>
            {isExpanded && node.children && (
                <div>
                    {Object.entries(node.children)
                        .sort(([, a], [, b]) => {
                            // Folders first, then files
                            if (a.type === 'folder' && b.type !== 'folder') return -1;
                            if (a.type !== 'folder' && b.type === 'folder') return 1;
                            return 0;
                        })
                        .map(([childName, childNode]) => (
                            <TreeNode
                                key={`${path}/${childName}`}
                                name={childName}
                                node={childNode}
                                path={`${path}/${childName}`}
                                level={level + 1}
                                openFile={openFile}
                                activeFile={activeFile}
                                deleteFile={deleteFile}
                                expandedFolders={expandedFolders}
                                toggleFolder={toggleFolder}
                            />
                        ))}
                </div>
            )}
        </div>
    );
};

const FileTree = () => {
    const { files, addFile, deleteFile: removeFile } = useFileStore();
    const { openFile, activeFile, closeFile } = useEditorStore();
    const [newFileName, setNewFileName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [createType, setCreateType] = useState('file');
    const [expandedFolders, setExpandedFolders] = useState(new Set(['src', 'src/components', 'src/components/ui', 'src/lib']));

    // Build a tree structure from flat paths
    const buildTree = () => {
        const tree = {};
        const filePaths = Object.keys(files).filter(p => !files[p]?.isFolder);

        filePaths.forEach(path => {
            const parts = path.split('/');
            let current = tree;

            parts.forEach((part, index) => {
                if (index === parts.length - 1) {
                    // It's a file
                    current[part] = { type: 'file', path };
                } else {
                    // It's a folder
                    if (!current[part]) {
                        current[part] = { type: 'folder', children: {} };
                    }
                    current = current[part].children;
                }
            });
        });

        return tree;
    };

    const toggleFolder = (path) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    const handleCreateFile = async () => {
        if (newFileName.trim()) {
            let path = newFileName.trim();

            // Ensure proper path format
            if (!path.startsWith('src/') && !path.includes('/')) {
                // Default to src folder for files without path
                path = `src/${path}`;
            }

            const content = createType === 'folder'
                ? ''
                : path.endsWith('.jsx') || path.endsWith('.js')
                    ? '// New file\n'
                    : path.endsWith('.css')
                        ? '/* New styles */\n'
                        : '';

            if (createType === 'file') {
                addFile(path, content);

                // Sync to WebContainer
                try {
                    await webContainer.writeFile(path, content);
                    console.log('✓ Created file in WebContainer:', path);
                } catch (err) {
                    console.error('Failed to create file in WebContainer:', err);
                }

                // Expand parent folders
                const parts = path.split('/');
                const newExpanded = new Set(expandedFolders);
                for (let i = 0; i < parts.length - 1; i++) {
                    newExpanded.add(parts.slice(0, i + 1).join('/'));
                }
                setExpandedFolders(newExpanded);

                openFile(path);
            } else {
                // Create folder by creating the directory in WebContainer
                try {
                    await webContainer.mkdir(path);
                    console.log('✓ Created folder in WebContainer:', path);

                    // Expand parent folders
                    const parts = path.split('/');
                    const newExpanded = new Set(expandedFolders);
                    for (let i = 0; i <= parts.length; i++) {
                        newExpanded.add(parts.slice(0, i + 1).join('/'));
                    }
                    setExpandedFolders(newExpanded);
                } catch (err) {
                    console.error('Failed to create folder in WebContainer:', err);
                }
            }

            setNewFileName('');
            setIsCreating(false);
        }
    };

    const handleDeleteFile = async (path) => {
        closeFile(path);
        removeFile(path);

        try {
            await webContainer.remove(path);
            console.log('✓ Deleted from WebContainer:', path);
        } catch (err) {
            console.error('Failed to delete from WebContainer:', err);
        }
    };

    const tree = buildTree();

    // Sort root items: folders first, then files
    const sortedRootItems = Object.entries(tree).sort(([, a], [, b]) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return 0;
    });

    return (
        <div className="h-full bg-[#181818] flex flex-col">
            {/* Header */}
            <div className="p-3 flex items-center justify-between border-b border-gray-700">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Explorer</span>
                <div className="flex items-center space-x-1">
                    <button
                        onClick={() => { setIsCreating(!isCreating); setCreateType('file'); setNewFileName('src/'); }}
                        className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                        title="New File"
                    >
                        <FilePlus size={14} />
                    </button>
                    <button
                        onClick={() => { setIsCreating(!isCreating); setCreateType('folder'); setNewFileName('src/'); }}
                        className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                        title="New Folder"
                    >
                        <FolderPlus size={14} />
                    </button>
                </div>
            </div>

            {/* New File/Folder Input */}
            {isCreating && (
                <div className="px-2 py-2 border-b border-gray-700">
                    <div className="text-[10px] text-gray-500 mb-1">
                        {createType === 'file' ? 'New file path (e.g., src/components/Button.jsx)' : 'New folder path'}
                    </div>
                    <input
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                        placeholder={createType === 'file' ? 'src/components/MyComponent.jsx' : 'src/components/new-folder'}
                        className="w-full bg-[#2a2a2a] text-white text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                    />
                    <div className="flex gap-2 mt-1">
                        <button
                            onClick={handleCreateFile}
                            className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded"
                        >
                            Create
                        </button>
                        <button
                            onClick={() => { setIsCreating(false); setNewFileName(''); }}
                            className="text-xs bg-gray-600 hover:bg-gray-700 px-2 py-0.5 rounded"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto py-1">
                {sortedRootItems.length === 0 ? (
                    <div className="px-3 py-4 text-gray-500 text-sm text-center">
                        No files yet
                    </div>
                ) : (
                    sortedRootItems.map(([name, node]) => (
                        <TreeNode
                            key={name}
                            name={name}
                            node={node}
                            path={name}
                            level={0}
                            openFile={openFile}
                            activeFile={activeFile}
                            deleteFile={handleDeleteFile}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default FileTree;

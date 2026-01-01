import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { FolderOpen, Plus, Trash2, Save, Clock, ChevronDown, X } from 'lucide-react';

const ProjectSelector = ({ onProjectLoad }) => {
    const {
        currentProject,
        projects,
        isLoading,
        hasUnsavedChanges,
        lastSaved,
        loadProjects,
        createProject,
        loadProject,
        deleteProject,
        saveProject
    } = useProjectStore();

    const [isOpen, setIsOpen] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        loadProjects();
    }, []);

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;

        const project = await createProject(newProjectName.trim());
        if (project) {
            setNewProjectName('');
            setShowCreateModal(false);
            // Notify parent to reset to starter template
            onProjectLoad?.(null);
        }
    };

    const handleLoadProject = async (projectId) => {
        const data = await loadProject(projectId);
        if (data) {
            setIsOpen(false);
            onProjectLoad?.(data);
        }
    };

    const handleDeleteProject = async (projectId, e) => {
        e.stopPropagation();
        if (deleteConfirm === projectId) {
            await deleteProject(projectId);
            setDeleteConfirm(null);
        } else {
            setDeleteConfirm(projectId);
            // Auto-clear confirm after 3 seconds
            setTimeout(() => setDeleteConfirm(null), 3000);
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="relative">
            {/* Current Project Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 bg-[#2a2a2a] hover:bg-[#333] rounded-lg transition-colors"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen size={16} className="text-blue-400 flex-shrink-0" />
                    <span className="text-sm text-gray-200 truncate">
                        {currentProject ? currentProject.name : 'No Project'}
                    </span>
                    {hasUnsavedChanges && (
                        <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" title="Unsaved changes" />
                    )}
                </div>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
                    {/* Create New Button */}
                    <button
                        onClick={() => { setShowCreateModal(true); setIsOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#2a2a2a] text-green-400"
                    >
                        <Plus size={16} />
                        <span className="text-sm">New Project</span>
                    </button>

                    <div className="border-t border-gray-700 my-1" />

                    {/* Project List */}
                    {projects.length === 0 ? (
                        <div className="px-3 py-4 text-center text-gray-500 text-sm">
                            No saved projects
                        </div>
                    ) : (
                        projects.map((project) => (
                            <div
                                key={project.id}
                                onClick={() => handleLoadProject(project.id)}
                                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#2a2a2a] group ${currentProject?.id === project.id ? 'bg-blue-600/20' : ''
                                    }`}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm text-gray-200 truncate">{project.name}</div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                        <Clock size={10} />
                                        {formatDate(project.updated_at)}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteProject(project.id, e)}
                                    className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${deleteConfirm === project.id
                                            ? 'bg-red-600 opacity-100'
                                            : 'hover:bg-red-600/50'
                                        }`}
                                    title={deleteConfirm === project.id ? 'Click again to confirm' : 'Delete project'}
                                >
                                    <Trash2 size={14} className="text-red-400" />
                                </button>
                            </div>
                        ))
                    )}

                    {/* Last Saved Info */}
                    {lastSaved && (
                        <div className="border-t border-gray-700 px-3 py-2 text-xs text-gray-500">
                            Last saved: {formatDate(lastSaved.toISOString())}
                        </div>
                    )}
                </div>
            )}

            {/* Create Project Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-xl w-80 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">New Project</h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="p-1 hover:bg-gray-700 rounded"
                            >
                                <X size={16} className="text-gray-400" />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                            placeholder="Project name..."
                            className="w-full bg-[#2a2a2a] text-white text-sm rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateProject}
                                disabled={!newProjectName.trim() || isLoading}
                                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded"
                            >
                                {isLoading ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Click Outside Handler */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};

export default ProjectSelector;

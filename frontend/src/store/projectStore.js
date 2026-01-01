import { create } from 'zustand';

const API_BASE = 'http://localhost:8000/api';

export const useProjectStore = create((set, get) => ({
    // State
    currentProjectId: null,
    currentProject: null,
    projects: [],
    isLoading: false,
    error: null,
    lastSaved: null,
    hasUnsavedChanges: false,

    // Set unsaved changes flag
    setUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),

    // Load project list
    loadProjects: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await fetch(`${API_BASE}/projects`);
            const data = await response.json();

            if (data.error) {
                set({ error: data.error, isLoading: false });
                return [];
            }

            set({ projects: data.projects || [], isLoading: false });
            return data.projects || [];
        } catch (error) {
            set({ error: error.message, isLoading: false });
            return [];
        }
    },

    // Create a new project
    createProject: async (name, description = '') => {
        set({ isLoading: true, error: null });
        try {
            const response = await fetch(`${API_BASE}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });
            const project = await response.json();

            if (project.error) {
                set({ error: project.error, isLoading: false });
                return null;
            }

            // Add to projects list
            set(state => ({
                projects: [project, ...state.projects],
                currentProjectId: project.id,
                currentProject: project,
                isLoading: false,
                hasUnsavedChanges: false
            }));

            return project;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            return null;
        }
    },

    // Load a specific project with all data
    loadProject: async (projectId) => {
        set({ isLoading: true, error: null });
        try {
            const response = await fetch(`${API_BASE}/projects/${projectId}`);
            const data = await response.json();

            if (data.error) {
                set({ error: data.error, isLoading: false });
                return null;
            }

            set({
                currentProjectId: projectId,
                currentProject: data.project,
                isLoading: false,
                hasUnsavedChanges: false,
                lastSaved: new Date()
            });

            return data;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            return null;
        }
    },

    // Save current project state
    saveProject: async (files, messages, context = []) => {
        const { currentProjectId } = get();
        if (!currentProjectId) {
            console.warn('No project selected to save');
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/projects/${currentProjectId}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files, messages, context })
            });
            const result = await response.json();

            if (result.error) {
                console.error('Save failed:', result.error);
                return null;
            }

            set({
                hasUnsavedChanges: false,
                lastSaved: new Date()
            });

            return result;
        } catch (error) {
            console.error('Save failed:', error);
            return null;
        }
    },

    // Save only files (for quick saves)
    saveFiles: async (files) => {
        const { currentProjectId } = get();
        if (!currentProjectId) return null;

        try {
            const response = await fetch(`${API_BASE}/projects/${currentProjectId}/files`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files })
            });
            const result = await response.json();

            if (!result.error) {
                set({ lastSaved: new Date() });
            }

            return result;
        } catch (error) {
            console.error('Save files failed:', error);
            return null;
        }
    },

    // Save only chat messages
    saveChat: async (messages) => {
        const { currentProjectId } = get();
        if (!currentProjectId) return null;

        try {
            const response = await fetch(`${API_BASE}/projects/${currentProjectId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages })
            });
            return await response.json();
        } catch (error) {
            console.error('Save chat failed:', error);
            return null;
        }
    },

    // Delete a project
    deleteProject: async (projectId) => {
        try {
            const response = await fetch(`${API_BASE}/projects/${projectId}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                set(state => ({
                    projects: state.projects.filter(p => p.id !== projectId),
                    currentProjectId: state.currentProjectId === projectId ? null : state.currentProjectId,
                    currentProject: state.currentProjectId === projectId ? null : state.currentProject
                }));
            }

            return result;
        } catch (error) {
            console.error('Delete failed:', error);
            return null;
        }
    },

    // Clear current project (start fresh)
    clearCurrentProject: () => {
        set({
            currentProjectId: null,
            currentProject: null,
            hasUnsavedChanges: false,
            lastSaved: null
        });
    }
}));

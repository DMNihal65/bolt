import { create } from 'zustand';

export const useEditorStore = create((set) => ({
    activeFile: null,
    openFiles: [],

    setActiveFile: (path) => set({ activeFile: path }),

    openFile: (path) => set((state) => {
        if (state.openFiles.includes(path)) {
            return { activeFile: path };
        }
        return {
            openFiles: [...state.openFiles, path],
            activeFile: path
        };
    }),

    closeFile: (path) => set((state) => {
        const newOpenFiles = state.openFiles.filter(p => p !== path);
        const newActiveFile = state.activeFile === path
            ? newOpenFiles[newOpenFiles.length - 1] || null
            : state.activeFile;

        return {
            openFiles: newOpenFiles,
            activeFile: newActiveFile
        };
    }),
}));

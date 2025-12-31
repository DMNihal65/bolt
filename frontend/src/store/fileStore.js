import { create } from 'zustand';

export const useFileStore = create((set, get) => ({
    files: {},

    setFiles: (files) => set({ files }),

    getFiles: () => get().files,

    updateFileContent: (path, content) => set((state) => ({
        files: {
            ...state.files,
            [path]: { content, modified: true }
        }
    })),

    addFile: (path, content = '') => set((state) => ({
        files: {
            ...state.files,
            [path]: { content, modified: true }
        }
    })),

    deleteFile: (path) => set((state) => {
        const newFiles = { ...state.files };
        delete newFiles[path];
        return { files: newFiles };
    }),

    markFileSaved: (path) => set((state) => ({
        files: {
            ...state.files,
            [path]: { ...state.files[path], modified: false }
        }
    })),

    // Get file contents as plain object for AI context
    getFileContents: () => {
        const files = get().files;
        const contents = {};
        for (const [path, data] of Object.entries(files)) {
            contents[path] = data.content;
        }
        return contents;
    }
}));

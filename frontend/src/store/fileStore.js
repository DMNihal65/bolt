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

    // Add a folder (represented as an empty marker in the store)
    addFolder: (path) => set((state) => ({
        files: {
            ...state.files,
            [path + '/.keep']: { content: '', isFolder: true }
        }
    })),

    deleteFile: (path) => set((state) => {
        const newFiles = { ...state.files };
        delete newFiles[path];
        return { files: newFiles };
    }),

    // Rename a file
    renameFile: (oldPath, newPath) => set((state) => {
        const newFiles = { ...state.files };
        if (newFiles[oldPath]) {
            newFiles[newPath] = newFiles[oldPath];
            delete newFiles[oldPath];
        }
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
            if (!data.isFolder) {
                contents[path] = data.content;
            }
        }
        return contents;
    }
}));


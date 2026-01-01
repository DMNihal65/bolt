import { create } from 'zustand';

export const useDiffStore = create((set, get) => ({
    // Pending diffs per file: { [filePath]: { original, proposed, hunks, status } }
    pendingDiffs: {},

    // Current file being edited
    currentDiffFile: null,

    // Set a new diff for a file
    setFileDiff: (filePath, original, proposed) => set((state) => ({
        pendingDiffs: {
            ...state.pendingDiffs,
            [filePath]: {
                original,
                proposed,
                status: 'pending', // pending, accepted, rejected
                timestamp: Date.now()
            }
        },
        currentDiffFile: filePath
    })),

    // Accept diff for a file
    acceptDiff: (filePath) => set((state) => {
        const newPendingDiffs = { ...state.pendingDiffs };
        if (newPendingDiffs[filePath]) {
            newPendingDiffs[filePath] = {
                ...newPendingDiffs[filePath],
                status: 'accepted'
            };
        }
        return { pendingDiffs: newPendingDiffs };
    }),

    // Reject diff for a file
    rejectDiff: (filePath) => set((state) => {
        const newPendingDiffs = { ...state.pendingDiffs };
        if (newPendingDiffs[filePath]) {
            newPendingDiffs[filePath] = {
                ...newPendingDiffs[filePath],
                status: 'rejected'
            };
        }
        return { pendingDiffs: newPendingDiffs };
    }),

    // Remove diff after processing
    removeDiff: (filePath) => set((state) => {
        const newPendingDiffs = { ...state.pendingDiffs };
        delete newPendingDiffs[filePath];
        return {
            pendingDiffs: newPendingDiffs,
            currentDiffFile: state.currentDiffFile === filePath ? null : state.currentDiffFile
        };
    }),

    // Clear all diffs
    clearAllDiffs: () => set({ pendingDiffs: {}, currentDiffFile: null }),

    // Get pending diff for a specific file
    getDiff: (filePath) => get().pendingDiffs[filePath] || null,

    // Check if file has pending diff
    hasPendingDiff: (filePath) => {
        const diff = get().pendingDiffs[filePath];
        return diff && diff.status === 'pending';
    },

    // Get all files with pending diffs
    getPendingFiles: () => {
        const diffs = get().pendingDiffs;
        return Object.keys(diffs).filter(path => diffs[path].status === 'pending');
    },

    // Set current file being viewed in diff mode
    setCurrentDiffFile: (filePath) => set({ currentDiffFile: filePath })
}));

import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
    messages: [],
    isLoading: false,
    pendingChanges: null, // { files: [], commands: [], thinking: '', message: '' }

    addMessage: (role, content) => set((state) => ({
        messages: [...state.messages, { role, content, timestamp: Date.now() }]
    })),

    setLoading: (isLoading) => set({ isLoading }),

    setPendingChanges: (changes) => set({ pendingChanges: changes }),

    clearPendingChanges: () => set({ pendingChanges: null }),

    clearMessages: () => set({ messages: [] }),
}));

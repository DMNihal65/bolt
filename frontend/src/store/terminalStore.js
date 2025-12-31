import { create } from 'zustand';

export const useTerminalStore = create((set) => ({
    terminal: null,

    setTerminal: (terminal) => set({ terminal }),

    write: (data) => set((state) => {
        state.terminal?.write(data);
        return {};
    }),
}));

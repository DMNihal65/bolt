import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../store/terminalStore';

const Terminal = () => {
    const terminalRef = useRef(null);
    const termInstanceRef = useRef(null);
    const { setTerminal } = useTerminalStore();

    useEffect(() => {
        if (!terminalRef.current || termInstanceRef.current) return;

        const term = new XTerm({
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
            },
            fontSize: 13,
            fontFamily: '"Cascadia Code", Menlo, Monaco, "Courier New", monospace',
            cursorBlink: true,
            convertEol: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        // Delay fit to ensure container has dimensions
        setTimeout(() => {
            try {
                fitAddon.fit();
            } catch (e) {
                console.warn('Failed to fit terminal:', e);
            }
        }, 100);

        term.writeln('\x1b[1;34m▶ WebContainer Terminal\x1b[0m');
        term.writeln('\x1b[90mWaiting for commands...\x1b[0m');
        term.writeln('');

        termInstanceRef.current = term;
        setTerminal(term);

        const handleResize = () => {
            try {
                fitAddon.fit();
            } catch (e) {
                // Ignore fit errors
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            term.dispose();
            termInstanceRef.current = null;
        };
    }, [setTerminal]);

    return (
        <div className="h-full w-full bg-[#1e1e1e] p-2">
            <div ref={terminalRef} className="h-full w-full" />
        </div>
    );
};

export default Terminal;

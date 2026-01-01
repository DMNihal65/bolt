import React, { useEffect, useState, useCallback } from 'react';
import CodeEditor from './components/Editor/CodeEditor';
import FileTree from './components/Sidebar/FileTree';
import Terminal from './components/Terminal/Terminal';
import Preview from './components/Preview/Preview';
import Chat from './components/Sidebar/Chat';
import ProjectSelector from './components/Sidebar/ProjectSelector';
import { webContainer } from './lib/webcontainer';
import { useFileStore } from './store/fileStore';
import { useChatStore } from './store/chatStore';
import { useTerminalStore } from './store/terminalStore';
import { useProjectStore } from './store/projectStore';
import { STARTER_TEMPLATE, flattenFiles } from './templates/starter';

function App() {
  const { files, setFiles, getFileContents } = useFileStore();
  const { messages } = useChatStore();
  const { terminal } = useTerminalStore();
  const { currentProjectId, saveProject, setUnsavedChanges } = useProjectStore();

  const [previewUrl, setPreviewUrl] = useState('');
  const [isBooting, setIsBooting] = useState(true);
  const [bootMessage, setBootMessage] = useState('Initializing WebContainer...');
  const [webContainerInstance, setWebContainerInstance] = useState(null);

  // Convert flat files back to WebContainer mount format
  const filesToMountFormat = useCallback((flatFiles) => {
    const result = {};

    for (const [path, data] of Object.entries(flatFiles)) {
      const content = typeof data === 'string' ? data : data.content || '';
      const parts = path.split('/');
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = { directory: {} };
        }
        current = current[parts[i]].directory;
      }

      current[parts[parts.length - 1]] = { file: { contents: content } };
    }

    return result;
  }, []);

  // Boot WebContainer with starter template
  const bootWithTemplate = useCallback(async (wc) => {
    setBootMessage('Mounting project files...');

    // Mount starter template
    await wc.mount(STARTER_TEMPLATE);

    // Update store with flattened files
    const flatFiles = flattenFiles(STARTER_TEMPLATE);
    setFiles(flatFiles);

    setBootMessage('Installing dependencies...');
    setIsBooting(false);

    // Install dependencies
    const installProcess = await wc.spawn('npm', ['install']);

    installProcess.output.pipeTo(new WritableStream({
      write(data) {
        if (terminal) {
          terminal.write(data);
        }
      }
    }));

    const installExitCode = await installProcess.exit;

    if (installExitCode === 0) {
      if (terminal) {
        terminal.writeln('\n\x1b[1;32m✓ Dependencies installed\x1b[0m');
        terminal.writeln('\x1b[1;34m▶ Starting dev server...\x1b[0m\n');
      }

      // Start dev server
      const startProcess = await wc.spawn('npm', ['run', 'dev']);

      startProcess.output.pipeTo(new WritableStream({
        write(data) {
          if (terminal) {
            terminal.write(data);
          }
        }
      }));
    } else {
      if (terminal) {
        terminal.writeln('\n\x1b[1;31m✗ Failed to install dependencies\x1b[0m');
      }
    }
  }, [terminal, setFiles]);

  // Load a saved project
  const handleProjectLoad = useCallback(async (data) => {
    if (!webContainerInstance) return;

    if (!data) {
      // New project - reset to starter template
      if (terminal) {
        terminal.writeln('\n\x1b[1;33m📁 Starting new project...\x1b[0m');
      }
      await bootWithTemplate(webContainerInstance);
      return;
    }

    // Load saved project
    if (terminal) {
      terminal.writeln(`\n\x1b[1;33m📁 Loading project: ${data.project.name}...\x1b[0m`);
    }

    // Convert saved files to store format
    const storeFiles = {};
    for (const [path, content] of Object.entries(data.files || {})) {
      storeFiles[path] = { content };
    }
    setFiles(storeFiles);

    // Mount files in WebContainer
    const mountFormat = filesToMountFormat(data.files || {});
    await webContainerInstance.mount(mountFormat);

    // Load chat messages (the Chat component will pick these up)
    if (data.messages && data.messages.length > 0) {
      // Chat store will be updated separately
    }

    if (terminal) {
      terminal.writeln(`\x1b[1;32m✓ Project loaded with ${Object.keys(data.files || {}).length} files\x1b[0m`);
    }
  }, [webContainerInstance, terminal, setFiles, filesToMountFormat, bootWithTemplate]);

  // Auto-save debounced
  useEffect(() => {
    if (!currentProjectId) return;

    const saveTimer = setTimeout(() => {
      const fileContents = getFileContents();
      const chatMessages = messages.map(m => ({ role: m.role, content: m.content }));

      saveProject(fileContents, chatMessages, []);
      console.log('✓ Auto-saved project');
    }, 5000); // Save 5 seconds after changes

    return () => clearTimeout(saveTimer);
  }, [files, messages, currentProjectId]);

  // Mark unsaved changes
  useEffect(() => {
    if (currentProjectId) {
      setUnsavedChanges(true);
    }
  }, [files, messages]);

  // Initial boot
  useEffect(() => {
    const boot = async () => {
      try {
        setBootMessage('Booting WebContainer...');
        const wc = await webContainer.boot();
        setWebContainerInstance(wc);

        // Listen for server-ready event
        wc.on('server-ready', (port, url) => {
          console.log('Server ready on port', port, 'at', url);
          setPreviewUrl(url);
        });

        await bootWithTemplate(wc);

      } catch (error) {
        console.error('Boot failed:', error);
        setBootMessage(`Boot failed: ${error.message}`);
        setIsBooting(false);
      }
    };

    boot();
  }, []);

  return (
    <div className="flex h-screen w-screen bg-[#1e1e1e] text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-gray-700 flex flex-col">
        {/* Project Selector */}
        <div className="p-2 border-b border-gray-700">
          <ProjectSelector onProjectLoad={handleProjectLoad} />
        </div>

        {/* File Tree */}
        <div className="h-1/3 border-b border-gray-700 overflow-auto">
          <FileTree />
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <Chat />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top: Editor & Preview */}
        <div className="flex-1 flex min-h-0">
          <div className="w-1/2 border-r border-gray-700">
            <CodeEditor />
          </div>
          <div className="w-1/2">
            <Preview url={previewUrl} isBooting={isBooting} bootMessage={bootMessage} />
          </div>
        </div>

        {/* Bottom: Terminal */}
        <div className="h-48 border-t border-gray-700">
          <Terminal />
        </div>
      </div>
    </div>
  );
}

export default App;

import React, { useEffect, useState } from 'react';
import CodeEditor from './components/Editor/CodeEditor';
import FileTree from './components/Sidebar/FileTree';
import Terminal from './components/Terminal/Terminal';
import Preview from './components/Preview/Preview';
import Chat from './components/Sidebar/Chat';
import { webContainer } from './lib/webcontainer';
import { useFileStore } from './store/fileStore';
import { useTerminalStore } from './store/terminalStore';

// Vite + React starter template
const STARTER_FILES = {
  'package.json': {
    file: {
      contents: JSON.stringify({
        name: "vite-react-app",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0"
        },
        devDependencies: {
          "@vitejs/plugin-react": "^4.0.0",
          vite: "^4.4.0"
        }
      }, null, 2)
    }
  },
  'vite.config.js': {
    file: {
      contents: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`
    }
  },
  'index.html': {
    file: {
      contents: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
    }
  },
  'src': {
    directory: {
      'main.jsx': {
        file: {
          contents: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`
        }
      },
      'App.jsx': {
        file: {
          contents: `import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app">
      <h1>Welcome to Bolt Clone!</h1>
      <p>Edit src/App.jsx and save to see changes.</p>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Count is {count}
        </button>
      </div>
    </div>
  )
}

export default App
`
        }
      },
      'App.css': {
        file: {
          contents: `.app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
  font-family: Inter, system-ui, sans-serif;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.card {
  padding: 2em;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a2e;
  color: white;
  cursor: pointer;
  transition: all 0.25s;
}

button:hover {
  background-color: #2d2d5a;
  border-color: #646cff;
}

button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}
`
        }
      },
      'index.css': {
        file: {
          contents: `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.87);
  background-color: #0f0f23;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  display: flex;
  place-items: center;
}

#root {
  width: 100%;
}
`
        }
      }
    }
  }
};

// Flatten files for the store
const flattenFiles = (files, prefix = '') => {
  const result = {};
  for (const [name, data] of Object.entries(files)) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (data.file) {
      result[path] = { content: data.file.contents };
    } else if (data.directory) {
      Object.assign(result, flattenFiles(data.directory, path));
    }
  }
  return result;
};

function App() {
  const { setFiles } = useFileStore();
  const { terminal } = useTerminalStore();
  const [previewUrl, setPreviewUrl] = useState('');
  const [isBooting, setIsBooting] = useState(true);
  const [bootMessage, setBootMessage] = useState('Initializing WebContainer...');

  useEffect(() => {
    const boot = async () => {
      try {
        setBootMessage('Booting WebContainer...');
        const wc = await webContainer.boot();

        // Listen for server-ready event
        wc.on('server-ready', (port, url) => {
          console.log('Server ready on port', port, 'at', url);
          setPreviewUrl(url);
        });

        setBootMessage('Mounting project files...');

        // Mount starter files
        await wc.mount(STARTER_FILES);

        // Update store with flattened files
        const flatFiles = flattenFiles(STARTER_FILES);
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
        <div className="h-2/5 border-b border-gray-700 overflow-auto">
          <FileTree />
        </div>
        <div className="h-3/5 overflow-hidden">
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

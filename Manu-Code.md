# Manu-Code

# Bolt.new Clone Architecture Guide

## Executive Summary

This guide provides a complete architecture for building an AI-powered web development platform similar to bolt.new, optimized for Google's Gemini API and designed to handle efficient code generation with minimal context usage.

---

## Core Architecture Overview

### Technology Stack

**Frontend:**

- **React + Vite + TypeScript**: Fast development environment
- **TailwindCSS + shadcn/ui**: Pre-configured UI components
- **Monaco Editor**: Code editing with syntax highlighting
- **Xterm.js**: Terminal emulator for command execution

**Backend/Runtime:**

- **WebContainers API** (StackBlitz): Browser-based Node.js runtime
    - Runs entirely client-side
    - No server infrastructure needed
    - Full filesystem, terminal, and package manager access
    - Perfect for live preview

**AI Layer:**

- **Google Gemini API**: Code generation (free tier: Gemini 2.5 Flash)
    - 10 RPM, 250K TPM, 250 requests/day
    - 1M token context window
    - Streaming support for real-time generation

**State Management:**

- **Zustand** or **Redux Toolkit**: Application state

---

## Key Technical Components

### 1. Efficient Code Generation with Diff Edits

**Problem:** Sending entire files wastes tokens and context window.

**Solution:** Use GNU Unified Diff format for targeted edits.

```tsx
// System prompt addition for Gemini
const DIFF_PROMPT = `
When editing code, output changes in GNU Unified Diff format as JSON:
{
  "target_file": "src/App.tsx",
  "operation": "edit", // "create", "edit", "delete"
  "diff": "--- a/src/App.tsx\\n+++ b/src/App.tsx\\n@@ -10,5 +10,5 @@\\n-  console.log('old');\\n+  console.log('new');"
}

For new files, use "create" operation with full content.
NEVER output full file content when editing - use diffs only.
`;

// Apply diff function
async function applyDiff(jsonDiff: string, webcontainer: WebContainer) {
  const { target_file, operation, diff, content } = JSON.parse(jsonDiff);

  if (operation === 'create') {
    await webcontainer.fs.writeFile(target_file, content);
  } else if (operation === 'edit') {
    const currentContent = await webcontainer.fs.readFile(target_file, 'utf-8');
    const patched = applyPatch(currentContent, diff);
    await webcontainer.fs.writeFile(target_file, patched);
  } else if (operation === 'delete') {
    await webcontainer.fs.rm(target_file);
  }
}

```

**Benefits:**

- 90% reduction in output tokens
- Faster generation
- Less context window usage
- More precise changes

---

### 2. Context Window Optimization with RAG

**Problem:** Large codebases exceed context limits.

**Solution:** Implement lightweight RAG with embeddings.

```tsx
import { embed } from '@xenova/transformers';

class CodebaseIndex {
  private embeddings: Map<string, Float32Array> = new Map();

  async indexFile(filepath: string, content: string) {
    // Use local embedding model (runs in browser via WASM)
    const embedding = await embed(content, {
      model: 'Xenova/all-MiniLM-L6-v2', // Lightweight, runs in browser
      pooling: 'mean'
    });

    this.embeddings.set(filepath, embedding);
  }

  async findRelevantFiles(query: string, topK: number = 5): Promise<string[]> {
    const queryEmbedding = await embed(query);

    const scores = Array.from(this.embeddings.entries()).map(([path, emb]) => ({
      path,
      score: cosineSimilarity(queryEmbedding, emb)
    }));

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => s.path);
  }
}

```

**Alternative: File Graph Approach**
Instead of full RAG, use dependency graph:

```tsx
interface FileNode {
  path: string;
  imports: string[];
  exports: string[];
  summary: string; // AI-generated 2-3 line summary
}

class ProjectGraph {
  async buildGraph(webcontainer: WebContainer) {
    // Parse all files, extract imports/exports
    // Store minimal summaries, not full content
  }

  getRelevantContext(targetFile: string): string[] {
    // Return: target file + direct dependencies + dependents
    // Much smaller than full codebase
  }
}

```

---

### 3. Agentic Workflow Architecture

**Pattern: Planning → Execution → Reflection**

```tsx
interface AgentState {
  userRequest: string;
  plan: TaskPlan;
  currentTask: Task | null;
  completedTasks: Task[];
  errors: Error[];
  fileTree: FileTree;
}

class CodeGenerationAgent {
  async execute(request: string): Promise<void> {
    // 1. PLANNING PHASE
    const plan = await this.createPlan(request);

    // 2. EXECUTION PHASE
    for (const task of plan.tasks) {
      try {
        await this.executeTask(task);
      } catch (error) {
        // 3. REFLECTION PHASE
        await this.handleError(error, task);
      }
    }

    // 4. VALIDATION PHASE
    await this.validateResult();
  }

  private async createPlan(request: string): Promise<TaskPlan> {
    const prompt = `
    Given this request: "${request}"

    Current project structure:
    ${this.getProjectSummary()}

    Create a step-by-step plan with:
    1. Files to create/modify
    2. Features to implement
    3. Dependencies to install
    4. Order of execution

    Output as JSON.
    `;

    return await this.callGemini(prompt, { responseFormat: 'json' });
  }

  private async executeTask(task: Task): Promise<void> {
    // Get relevant context only
    const relevantFiles = await this.getRelevantContext(task);

    const prompt = `
    Task: ${task.description}

    Relevant files:
    ${relevantFiles.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}

    Generate code changes as diffs.
    `;

    const response = await this.callGemini(prompt);
    await this.applyChanges(response);
  }

  private async handleError(error: Error, task: Task): Promise<void> {
    // Ingest error, regenerate fix
    const fixPrompt = `
    Task failed: ${task.description}
    Error: ${error.message}
    Stack: ${error.stack}

    Analyze the error and generate a fix.
    `;

    const fix = await this.callGemini(fixPrompt);
    await this.applyChanges(fix);
  }
}

```

---

### 4. Streaming UI with Live Preview

```tsx
class PreviewManager {
  private webcontainer: WebContainer;
  private previewUrl: string | null = null;

  async initialize() {
    this.webcontainer = await WebContainer.boot();

    // Mount starter template
    await this.webcontainer.mount({
      'package.json': {
        file: {
          contents: JSON.stringify({
            name: 'app',
            scripts: { dev: 'vite' },
            dependencies: { /* ... */ }
          })
        }
      },
      // ... other files
    });

    // Start dev server
    const process = await this.webcontainer.spawn('npm', ['run', 'dev']);

    // Listen for server ready
    this.webcontainer.on('server-ready', (port, url) => {
      this.previewUrl = url;
      this.notifyPreviewReady(url);
    });
  }

  async updateFile(path: string, content: string) {
    await this.webcontainer.fs.writeFile(path, content);
    // Vite HMR handles live reload automatically
  }

  async installPackage(pkg: string) {
    const install = await this.webcontainer.spawn('npm', ['install', pkg]);
    return this.streamOutput(install);
  }
}

```

---

## Recommended Libraries & Tools

### Essential Dependencies

```json
{
  "dependencies": {
    "@webcontainer/api": "^1.2.0",
    "@google/generative-ai": "^0.21.0",

    // UI
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@monaco-editor/react": "^4.6.0",
    "@xterm/xterm": "^5.5.0",

    // State
    "zustand": "^4.5.0",
    "@tanstack/react-query": "^5.0.0",

    // Code processing
    "diff": "^5.2.0",
    "@babel/parser": "^7.24.0",

    // Optional: Browser-based embeddings
    "@xenova/transformers": "^2.17.0"
  }
}

```

### NOT Needed

- ❌ **LangGraph/LangChain**: Too heavyweight, adds complexity
- ❌ **Autogen**: Overkill for this use case
- ❌ **Pinecone/ChromaDB**: External services, adds latency
- ❌ **Convex**: Not necessary with WebContainers

### Why These Choices?

1. **WebContainers** - Core requirement for browser-based execution
2. **Gemini API** - Free tier is generous, good code generation
3. **Local embeddings** - Faster, no API costs, privacy
4. **Zustand** - Lightweight state management
5. **Diff-based editing** - Token efficiency

---

## Token Optimization Strategies

### 1. Prompt Caching

Gemini 3.0+ supports prompt caching - cache your project context:

```tsx
const cachedContext = await gemini.generateContent({
  contents: [{
    role: 'user',
    parts: [{
      text: `Project context:\n${projectStructure}\n${dependencies}`,
      cached: true  // Cache this part
    }]
  }]
});

```

### 2. Incremental Context Updates

Don't resend full project each time:

```tsx
class ContextManager {
  private cachedSummary: string = '';

  async getMinimalContext(task: Task): Promise<string> {
    // Only include:
    // - Task-relevant files (2-3 files)
    // - File summaries (not full content)
    // - Recent changes (last 3 operations)

    return `
    Relevant files:
    - ${task.targetFile}: ${await this.getSummary(task.targetFile)}

    Recent changes:
    ${this.getRecentChanges(3)}
    `;
  }
}

```

### 3. Smart File Selection

```tsx
async function getSmartContext(query: string, graph: ProjectGraph) {
  // 1. Get target file
  const targetFile = extractTargetFile(query);

  // 2. Get dependencies (imports)
  const deps = graph.getDependencies(targetFile);

  // 3. Get dependents (who imports this)
  const dependents = graph.getDependents(targetFile);

  // Return only these 3-5 files, not entire codebase
  return [targetFile, ...deps.slice(0, 2), ...dependents.slice(0, 1)];
}

```

---

## Implementation Phases

### Phase 1: MVP (Week 1-2)

- ✅ WebContainer setup with Vite starter
- ✅ Basic Gemini integration with streaming
- ✅ Monaco editor + preview pane
- ✅ Simple prompt → code generation
- ✅ File creation/editing (full file replacement)

### Phase 2: Optimization (Week 3-4)

- ✅ Diff-based editing implementation
- ✅ Project structure indexing
- ✅ Context-aware generation
- ✅ Error ingestion & auto-fix
- ✅ Terminal integration for npm installs

### Phase 3: Advanced (Week 5-6)

- ✅ Planning mode (break down requests)
- ✅ Multi-file operations
- ✅ RAG/embeddings for large codebases
- ✅ Response caching
- ✅ Deployment integration

---

## Gemini API Best Practices

### Rate Limit Management

```tsx
class RateLimiter {
  private requestQueue: Array<() => Promise<any>> = [];
  private processing = false;

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.requestQueue.length === 0) return;

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const fn = this.requestQueue.shift()!;
      await fn();

      // Respect 10 RPM for Gemini Flash free tier
      await sleep(6000); // 6 seconds between requests
    }

    this.processing = false;
  }
}

```

### Model Selection

```tsx
// Use appropriate model for task
const modelConfig = {
  planning: 'gemini-2.5-flash',      // Fast, good reasoning
  codeGen: 'gemini-2.5-flash',       // Best for code
  simple: 'gemini-2.5-flash-lite',   // Quick tasks, 1000 RPD
};

```

---

## Error Handling & Recovery

```tsx
class ErrorRecoveryAgent {
  async handleBuildError(error: string, context: FileContext) {
    // 1. Parse error message
    const parsed = this.parseError(error);

    // 2. Get relevant file content
    const fileContent = await webcontainer.fs.readFile(parsed.file);

    // 3. Generate fix with minimal context
    const fix = await gemini.generateContent(`
      Error in ${parsed.file} at line ${parsed.line}:
      ${parsed.message}

      Current code:
      ${this.extractRelevantLines(fileContent, parsed.line, 5)}

      Generate a diff to fix this error.
    `);

    // 4. Apply fix
    await this.applyDiff(fix);

    // 5. Retry build
    return this.rebuild();
  }
}

```

---

## Performance Benchmarks

Expected metrics with Gemini 2.5 Flash:

- **Initial generation**: 5-10 seconds
- **Diff edit**: 2-3 seconds
- **File creation**: 3-5 seconds
- **Error fix**: 3-4 seconds
- **Context tokens used**: 2K-5K per request (vs 20K-50K full file)
- **Daily capacity**: 250 requests (free tier)

---

## Sample Project Structure

```
bolt-clone/
├── src/
│   ├── components/
│   │   ├── Editor.tsx          # Monaco editor wrapper
│   │   ├── Preview.tsx         # WebContainer preview
│   │   ├── Terminal.tsx        # Xterm.js terminal
│   │   └── Chat.tsx            # AI chat interface
│   ├── services/
│   │   ├── gemini.ts           # Gemini API client
│   │   ├── webcontainer.ts    # WebContainer manager
│   │   ├── diffEngine.ts      # Diff generation/application
│   │   └── contextManager.ts  # Context optimization
│   ├── agents/
│   │   ├── planningAgent.ts   # Task decomposition
│   │   ├── codeAgent.ts       # Code generation
│   │   └── errorAgent.ts      # Error recovery
│   └── utils/
│       ├── embeddings.ts      # Local embedding generation
│       └── fileGraph.ts       # Dependency tracking
└── templates/
    └── vite-react-ts/         # Starter template

```

---

## Alternatives to Consider

If Gemini free tier is insufficient:

1. **Groq** (via GroqCloud) - 1000 requests/day free, very fast
2. **OpenRouter** - Aggregate API, pay-per-use across models
3. **Local models** - Llama 3.3 70B via Ollama (requires GPU)

---

## Conclusion

This architecture achieves:

- ✅ Efficient token usage via diff edits (90% reduction)
- ✅ Fast live preview with WebContainers
- ✅ Smart context management (RAG or graph-based)
- ✅ Agentic workflow (plan → execute → reflect)
- ✅ Error ingestion and auto-fix
- ✅ Free tier friendly (250 requests/day)

Start with Phase 1 MVP, then incrementally add optimizations. The diff-based approach is the single most important optimization for staying within token limits.

### Overview of the Architecture

To build a bolt.new clone, we'll design a system where users prompt an AI agent to build React apps starting from a pre-configured Vite + React + TailwindCSS + Shadcn template. The agent will handle planning, clarification, feature/MVP breakdown, code generation/editing, library installation via terminal, error fixing, and live previews. The key is to optimize for efficiency given Gemini's free tier limits (e.g., ~15-20 RPM, 1M token context, but we'll minimize token usage).

The architecture uses a **full-stack web app**:

- **Frontend**: Vite/React app for user input, chat interface, and live preview pane.
- **Backend**: Python server for the AI agent logic, file management, and execution.
- **AI Agent**: Built with LangGraph for workflow orchestration, LangChain for LLM integrations/tools, and ChromaDB for optimized context retrieval.
- **LLM**: Google's Gemini API (e.g., gemini-1.5-flash or pro) for planning, code gen, and reasoning.
- **Code Management**: File-based workspace with targeted edits via diffs/patches to avoid sending full files.
- **Execution & Preview**: Subprocess for terminal commands; Vite dev server for real-time previews.
- **Error Handling**: Ingest logs/errors, feed back to agent for autonomous fixes.

This setup draws from researched best practices:

- Bolt.new-like systems (e.g., Replit Agent, Aider) use agentic workflows for iterative code building with auto-testing/refactoring.
- LangGraph excels for multi-step agents (planning → editing → execution).
- Targeted edits via diffs (from tools like Aider/OpenHands) reduce context bloat.
- Vector DBs like Chroma enable RAG-style retrieval for relevant code chunks, optimizing Gemini's context window (avoid sending entire projects; target 4K-32K tokens per call).
- Gemini integrates seamlessly with LangChain for tool-calling and code gen.

We'll avoid cloud-heavy deps like Pinecone (requires paid API) for free-tier friendliness; use local ChromaDB instead. Skip Convex (backend DB, overkill here) and AutoGen (multi-agent, but LangGraph is more workflow-focused). No need for Ingest (data pipelines) unless scaling logs.

### Key Components and Tech Stack

### 1. **Frontend (User Interface & Preview)**

- **Framework**: Vite + React + TypeScript + TailwindCSS + Shadcn/UI (as specified; start with a boilerplate like `create-vite`).
- **Features**:
    - Chat interface: Text input for prompts, display agent responses/clarifications.
    - Live preview: Embed an iframe pointing to a local dev server (e.g., `http://localhost:3001`) running the built app. Use React hooks to poll/reload on changes.
    - Project controls: Buttons to start new project, export code, view file tree.
- **Communication**: WebSocket (via [Socket.io](http://socket.io/)) for real-time agent updates; fallback to REST API.
- **Libraries**:
    - `@radix-ui/react-*` and `shadcn/ui` for components.
    - `socket.io-client` for real-time.
    - `react-resizable-panels` for splitting chat/preview views.
- **Why?** Keeps it lightweight; previews run via backend-triggered Vite server.

### 2. **Backend Server**

- **Framework**: FastAPI (Python) for API endpoints and WebSockets. Handles user sessions, project workspaces.
- **Workspace Management**: Each project in a dedicated folder (e.g., `./workspaces/project-id/`) cloned from a template repo (Vite boilerplate). Use Git for versioning/diffs internally.
- **Security**: Run executions in Docker containers to sandbox terminal commands (e.g., `npm install`) and prevent host damage.
- **Libraries**:
    - `fastapi`, `uvicorn`, `socketio` for server/WebSockets.
    - `docker-py` for containerized execution.
    - `subprocess` for simple commands; fallback to Docker for npm/yarn.

### 3. **AI Agent Workflow (LangGraph)**

- **Core**: LangGraph for a graph-based agent with nodes/states. State tracks: prompt, project files (as paths), errors, plan, context chunks.
- **Workflow Steps** (Nodes in LangGraph):
    1. **Clarifier**: Uses Gemini to ask user questions if prompt is ambiguous (e.g., "What auth provider?"). Routes back to user via WebSocket.
    2. **Planner**: Breaks down into MVP/features (e.g., "Core: Login page; MVP: Add dashboard"). Outputs a task list.
    3. **Code Generator/Editor**: Retrieves relevant context (via Chroma), prompts Gemini for targeted edits (e.g., "Output a diff to add a button to App.tsx"). Applies edits.
    4. **Executor**: Runs terminal commands (e.g., `npm install axios`) in sandbox.
    5. **Tester/Previewer**: Builds app (`npm run build`), starts dev server, captures preview (e.g., via Puppeteer screenshot if needed), tests for errors.
    6. **Error Handler**: If build fails, ingests error logs, retrieves relevant code chunks, prompts Gemini to fix (e.g., "Fix this error in file X: [error msg]").
    - **Looping**: LangGraph edges for iteration (e.g., if error, loop to Editor; if plan incomplete, back to Planner).
- **Persistence**: Use LangGraph's built-in checkpointing (SQLite) to resume sessions.
- **Tools in LangChain**:
    - Custom tools: `edit_file` (takes diff/patch), `run_command` (terminal exec), `get_context` (from vector DB), `test_build` (run `npm run dev` and check logs).
    - Gemini as tool-caller via LangChain's `GoogleGenerativeAI` integration.
- **Libraries**:
    - `langgraph` for graph/workflows.
    - `langchain`, `langchain-google-genai` for chains, agents, and Gemini API.
    - `difflib` or `patch` (from `diff-match-patch` pip package) for applying targeted edits.

### 4. **Optimized Context Management & Targeted Edits**

- **Problem**: Full files bloat Gemini's context (free tier limits ~1M tokens, but costs add up; aim for <10K per call).
- **Solution**: RAG-like system with embeddings.
    - Split code files into chunks (e.g., functions/classes via `langchain.text_splitter.RecursiveCharacterTextSplitter`).
    - Embed chunks using Gemini's embedding model (`embed_content` API).
    - Store in ChromaDB (local vector DB) with metadata (file path, line numbers).
    - For edits: Query Chroma with task description (e.g., "Add login form") to retrieve top-5 relevant chunks + file tree overview.
    - Prompt Gemini: "Given this context [chunks], output a unified diff to edit [file]. Do not rewrite the whole file."
    - Apply diff: Use Python's `difflib.unified_diff` to generate/apply patches safely.
- **Error Fixing**: Embed error messages, retrieve similar past fixes or relevant code, prompt for targeted patch.
- **Benefits**: Reduces tokens by 70-90% (from full project to snippets); inspired by Aider/OpenHands and diff-based LLM prompting.
- **Libraries**:
    - `chromadb` for vector store.
    - `langchain.embeddings` with Gemini.
    - `diff-match-patch` for robust patching.

### 5. **Integration with Gemini API**

- Use `langchain-google-genai` for easy wrapping (e.g., `GoogleGenerativeAI(model="gemini-1.5-flash")`).
- For code gen: Fine-tune prompts like "Generate React code as a diff patch."
- Free tier: Batch calls, use cheaper models for planning, pro for code. Monitor usage via API dashboard.
- Agentic features: Gemini 3 supports tools/agents natively; integrate via LangChain's tool-calling.

### 6. **Additional Features**

- **Live Preview**: Backend starts Vite dev server in workspace (`npm run dev`), proxies to frontend iframe. On changes, restart and notify via WebSocket.
- **Library Installation**: Agent decides (e.g., "Need Axios? Run npm install axios"), executes via tool.
- **Scalability**: Start local; later add cloud (e.g., Vercel for frontend, Render for backend).
- **Testing**: Auto-run `npm test` if setup; Gemini generates unit tests.

### Implementation Steps

1. **Setup Boilerplate**:
    - Create Vite/React frontend: `npm create vite@latest my-bolt -- --template react-ts`.
    - Add Tailwind/Shadcn: Follow shadcn docs.
    - Setup FastAPI backend: `pip install fastapi uvicorn langchain langgraph chromadb langchain-google-genai diff-match-patch`.
    - Get Gemini API key, set env var `GOOGLE_API_KEY`.
2. **Build Agent Graph**:
    - Define nodes/tools in LangGraph (see tutorials like or ).
    - Example prompt for editor: "Context: {retrieved_chunks}. Task: {task}. Output: Unified diff for {file}."
3. **Implement Context Retrieval**:
    - On project init, chunk/embed/store files in Chroma.
    - Update DB on every edit.
4. **Handle Edits & Execution**:
    - Parse Gemini output as diff, apply to file.
    - Sandbox commands: Use Docker to run `npm` in isolated container.
5. **Frontend Integration**:
    - WebSocket endpoint: `/ws` for agent chat.
    - Preview: `<iframe src="/preview/project-id" />` proxied from backend.
6. **Test & Iterate**:
    - Start with simple prompt: "Build a todo app."
    - Monitor Gemini usage; optimize prompts.
    - Debug: LangGraph has visualization for graphs.

### Potential Challenges & Mitigations

- **Gemini Limits**: Use caching for embeddings; batch planning steps.
- **Error Prone Edits**: Add human review step in chat; use Gemini's safety settings.
- **Complexity**: Start MVP with just planning + basic edits; add preview later.
- **Cost**: Free tier suffices for dev; scale to paid if needed.

This architecture is substantiated by sources like LangGraph docs, Aider's diff editing, and Chroma RAG patterns, making it robust for your bolt.new clone. If you need code snippets or refinements, provide more details!

### Overview of the Architecture

To build a bolt.new clone, we'll design a system where users prompt an AI agent to build React apps starting from a pre-configured Vite + React + TailwindCSS + Shadcn template. The agent will handle planning, clarification, feature/MVP breakdown, code generation/editing, library installation via terminal, error fixing, and live previews. The key is to optimize for efficiency given Gemini's free tier limits (e.g., ~15-20 RPM, 1M token context, but we'll minimize token usage).

The architecture uses a **full-stack web app**:

- **Frontend**: Vite/React app for user input, chat interface, and live preview pane.
- **Backend**: Python server for the AI agent logic, file management, and execution.
- **AI Agent**: Built with LangGraph for workflow orchestration, LangChain for LLM integrations/tools, and ChromaDB for optimized context retrieval.
- **LLM**: Google's Gemini API (e.g., gemini-1.5-flash or pro) for planning, code gen, and reasoning.
- **Code Management**: File-based workspace with targeted edits via diffs/patches to avoid sending full files.
- **Execution & Preview**: Subprocess for terminal commands; Vite dev server for real-time previews.
- **Error Handling**: Ingest logs/errors, feed back to agent for autonomous fixes.

This setup draws from researched best practices:

- Bolt.new-like systems (e.g., Replit Agent, Aider) use agentic workflows for iterative code building with auto-testing/refactoring.
- LangGraph excels for multi-step agents (planning → editing → execution).
- Targeted edits via diffs (from tools like Aider/OpenHands) reduce context bloat.
- Vector DBs like Chroma enable RAG-style retrieval for relevant code chunks, optimizing Gemini's context window (avoid sending entire projects; target 4K-32K tokens per call).
- Gemini integrates seamlessly with LangChain for tool-calling and code gen.

We'll avoid cloud-heavy deps like Pinecone (requires paid API) for free-tier friendliness; use local ChromaDB instead. Skip Convex (backend DB, overkill here) and AutoGen (multi-agent, but LangGraph is more workflow-focused). No need for Ingest (data pipelines) unless scaling logs.

### Key Components and Tech Stack

### 1. **Frontend (User Interface & Preview)**

- **Framework**: Vite + React + TypeScript + TailwindCSS + Shadcn/UI (as specified; start with a boilerplate like `create-vite`).
- **Features**:
    - Chat interface: Text input for prompts, display agent responses/clarifications.
    - Live preview: Embed an iframe pointing to a local dev server (e.g., `http://localhost:3001`) running the built app. Use React hooks to poll/reload on changes.
    - Project controls: Buttons to start new project, export code, view file tree.
- **Communication**: WebSocket (via [Socket.io](http://socket.io/)) for real-time agent updates; fallback to REST API.
- **Libraries**:
    - `@radix-ui/react-*` and `shadcn/ui` for components.
    - `socket.io-client` for real-time.
    - `react-resizable-panels` for splitting chat/preview views.
- **Why?** Keeps it lightweight; previews run via backend-triggered Vite server.

### 2. **Backend Server**

- **Framework**: FastAPI (Python) for API endpoints and WebSockets. Handles user sessions, project workspaces.
- **Workspace Management**: Each project in a dedicated folder (e.g., `./workspaces/project-id/`) cloned from a template repo (Vite boilerplate). Use Git for versioning/diffs internally.
- **Security**: Run executions in Docker containers to sandbox terminal commands (e.g., `npm install`) and prevent host damage.
- **Libraries**:
    - `fastapi`, `uvicorn`, `socketio` for server/WebSockets.
    - `docker-py` for containerized execution.
    - `subprocess` for simple commands; fallback to Docker for npm/yarn.

### 3. **AI Agent Workflow (LangGraph)**

- **Core**: LangGraph for a graph-based agent with nodes/states. State tracks: prompt, project files (as paths), errors, plan, context chunks.
- **Workflow Steps** (Nodes in LangGraph):
    1. **Clarifier**: Uses Gemini to ask user questions if prompt is ambiguous (e.g., "What auth provider?"). Routes back to user via WebSocket.
    2. **Planner**: Breaks down into MVP/features (e.g., "Core: Login page; MVP: Add dashboard"). Outputs a task list.
    3. **Code Generator/Editor**: Retrieves relevant context (via Chroma), prompts Gemini for targeted edits (e.g., "Output a diff to add a button to App.tsx"). Applies edits.
    4. **Executor**: Runs terminal commands (e.g., `npm install axios`) in sandbox.
    5. **Tester/Previewer**: Builds app (`npm run build`), starts dev server, captures preview (e.g., via Puppeteer screenshot if needed), tests for errors.
    6. **Error Handler**: If build fails, ingests error logs, retrieves relevant code chunks, prompts Gemini to fix (e.g., "Fix this error in file X: [error msg]").
    - **Looping**: LangGraph edges for iteration (e.g., if error, loop to Editor; if plan incomplete, back to Planner).
- **Persistence**: Use LangGraph's built-in checkpointing (SQLite) to resume sessions.
- **Tools in LangChain**:
    - Custom tools: `edit_file` (takes diff/patch), `run_command` (terminal exec), `get_context` (from vector DB), `test_build` (run `npm run dev` and check logs).
    - Gemini as tool-caller via LangChain's `GoogleGenerativeAI` integration.
- **Libraries**:
    - `langgraph` for graph/workflows.
    - `langchain`, `langchain-google-genai` for chains, agents, and Gemini API.
    - `difflib` or `patch` (from `diff-match-patch` pip package) for applying targeted edits.

### 4. **Optimized Context Management & Targeted Edits**

- **Problem**: Full files bloat Gemini's context (free tier limits ~1M tokens, but costs add up; aim for <10K per call).
- **Solution**: RAG-like system with embeddings.
    - Split code files into chunks (e.g., functions/classes via `langchain.text_splitter.RecursiveCharacterTextSplitter`).
    - Embed chunks using Gemini's embedding model (`embed_content` API).
    - Store in ChromaDB (local vector DB) with metadata (file path, line numbers).
    - For edits: Query Chroma with task description (e.g., "Add login form") to retrieve top-5 relevant chunks + file tree overview.
    - Prompt Gemini: "Given this context [chunks], output a unified diff to edit [file]. Do not rewrite the whole file."
    - Apply diff: Use Python's `difflib.unified_diff` to generate/apply patches safely.
- **Error Fixing**: Embed error messages, retrieve similar past fixes or relevant code, prompt for targeted patch.
- **Benefits**: Reduces tokens by 70-90% (from full project to snippets); inspired by Aider/OpenHands and diff-based LLM prompting.
- **Libraries**:
    - `chromadb` for vector store.
    - `langchain.embeddings` with Gemini.
    - `diff-match-patch` for robust patching.

### 5. **Integration with Gemini API**

- Use `langchain-google-genai` for easy wrapping (e.g., `GoogleGenerativeAI(model="gemini-1.5-flash")`).
- For code gen: Fine-tune prompts like "Generate React code as a diff patch."
- Free tier: Batch calls, use cheaper models for planning, pro for code. Monitor usage via API dashboard.
- Agentic features: Gemini 3 supports tools/agents natively; integrate via LangChain's tool-calling.

### 6. **Additional Features**

- **Live Preview**: Backend starts Vite dev server in workspace (`npm run dev`), proxies to frontend iframe. On changes, restart and notify via WebSocket.
- **Library Installation**: Agent decides (e.g., "Need Axios? Run npm install axios"), executes via tool.
- **Scalability**: Start local; later add cloud (e.g., Vercel for frontend, Render for backend).
- **Testing**: Auto-run `npm test` if setup; Gemini generates unit tests.

### Implementation Steps

1. **Setup Boilerplate**:
    - Create Vite/React frontend: `npm create vite@latest my-bolt -- --template react-ts`.
    - Add Tailwind/Shadcn: Follow shadcn docs.
    - Setup FastAPI backend: `pip install fastapi uvicorn langchain langgraph chromadb langchain-google-genai diff-match-patch`.
    - Get Gemini API key, set env var `GOOGLE_API_KEY`.
2. **Build Agent Graph**:
    - Define nodes/tools in LangGraph (see tutorials like or ).
    - Example prompt for editor: "Context: {retrieved_chunks}. Task: {task}. Output: Unified diff for {file}."
3. **Implement Context Retrieval**:
    - On project init, chunk/embed/store files in Chroma.
    - Update DB on every edit.
4. **Handle Edits & Execution**:
    - Parse Gemini output as diff, apply to file.
    - Sandbox commands: Use Docker to run `npm` in isolated container.
5. **Frontend Integration**:
    - WebSocket endpoint: `/ws` for agent chat.
    - Preview: `<iframe src="/preview/project-id" />` proxied from backend.
6. **Test & Iterate**:
    - Start with simple prompt: "Build a todo app."
    - Monitor Gemini usage; optimize prompts.
    - Debug: LangGraph has visualization for graphs.

### Potential Challenges & Mitigations

- **Gemini Limits**: Use caching for embeddings; batch planning steps.
- **Error Prone Edits**: Add human review step in chat; use Gemini's safety settings.
- **Complexity**: Start MVP with just planning + basic edits; add preview later.
- **Cost**: Free tier suffices for dev; scale to paid if needed.

This architecture is substantiated by sources like LangGraph docs, Aider's diff editing, and Chroma RAG patterns, making it robust for your bolt.new clone. If you need code snippets or refinements, provide more details!

You’re basically trying to build a **mini Replit + Cursor + bolt.new hybrid** — and this is a **serious but very achievable system** if you design it correctly from day one.

Below is a **battle-tested architecture** that solves **exactly** the problems you mentioned:

- 🔹 targeted / diff-based edits
- 🔹 no full-file context dumping
- 🔹 terminal execution
- 🔹 live preview
- 🔹 self-healing via error ingestion
- 🔹 works with **Gemini API (free tier friendly)**

I’ll explain this in **layers**, then give you **concrete tech choices**, **why some tools are bad fits**, and finally a **step-by-step build roadmap**.

---

## 1️⃣ Mental Model (Critical)

Think of your system as **4 cooperating agents + 1 execution brain**

```
User Prompt
   ↓
Planner Agent → Clarifier Agent
   ↓
Task Graph (DAG)
   ↓
Code Agent ↔ Diff Engine ↔ File System
   ↓
Executor (Terminal / Dev Server)
   ↓
Preview + Error Loop

```

⚠️ **Key Insight**

> This is NOT “chatbot generates code”.
> 
> 
> This is **AI orchestrating a real developer environment**.
> 

---

## 2️⃣ High-Level Architecture

![Image](https://www.stackspot.com/wp-content/uploads/2023/11/StackSpot-AIs-architecture_01-1024x649.png)

![Image](https://miro.medium.com/v2/resize%3Afit%3A2000/1%2AKKKdVTkdU_39D7lrlw4Ugw.png)

![Image](https://substackcdn.com/image/fetch/f_auto%2Cq_auto%3Agood%2Cfl_progressive%3Asteep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F1320193c-ba4e-4c89-910a-68cdef5e7f25_635x405.png)

![Image](https://miro.medium.com/1%2ATvuSIBszdKqUWsG_-UR9CA.png)

### Core Components

| Layer | Responsibility |
| --- | --- |
| Frontend | Prompting, file tree, live preview |
| Orchestrator | Agent control, task planning |
| Diff Engine | Minimal file edits |
| Execution Layer | npm, dev server |
| Memory Layer | Context compression |
| Error Loop | Self-healing |

---

## 3️⃣ Agent Breakdown (Very Important)

### 🔹 1. Planner Agent

**Purpose**

- Convert user prompt → feature list → MVP scope → tasks

**Input**

```
"Build a Kanban app with auth and drag-drop"

```

**Output (Structured JSON)**

```json
{
  "app_type": "frontend",
  "stack": ["react", "tailwind", "shadcn"],
  "features": [
    "Auth UI",
    "Kanban board",
    "Drag and drop"
  ],
  "tasks": [
    "Create layout",
    "Create auth pages",
    "Add dnd logic"
  ]
}

```

👉 This **never touches code**

---

### 🔹 2. Clarifier Agent

**Only activates if needed**

- Missing auth provider?
- Local storage vs backend?
- Dark mode?

This keeps Gemini calls cheap.

---

### 🔹 3. Code Agent (MOST IMPORTANT)

This agent:

- **Never outputs full files**
- Only outputs **structured diffs**

Example output:

```json
{
  "file": "src/App.tsx",
  "edits": [
    {
      "type": "replace",
      "target": "return (",
      "content": "return (<MainLayout />)"
    }
  ]
}

```

This is how Cursor & bolt.new actually work.

---

### 🔹 4. Debug Agent

Triggers when:

- Vite build fails
- TS error
- Runtime crash

**Input**

- Error log
- File path
- Recent diffs only

**Output**

- Patch diff to fix issue

---

## 4️⃣ Diff & Targeted Edit System (Your Biggest Question)

### ❌ What NOT to do

- Sending full files ❌
- Letting LLM rewrite everything ❌
- Token explosion ❌

---

### ✅ Correct Approach (Proven)

### 1. Parse files into **AST**

Use:

- `tree-sitter`
- `@babel/parser`

### 2. Store Code Chunks

Each file is split into:

- imports
- components
- hooks
- JSX blocks

```tsx
FileChunk {
  file: "App.tsx",
  section: "imports",
  hash: "abc123"
}

```

### 3. LLM gets only:

- The **relevant chunk**
- Surrounding 10–15 lines
- Current task description

---

### 🔥 Apply edits via Diff Engine

Libraries:

- `diff-match-patch`
- `unidiff`
- `git apply` (yes, locally)

This makes edits **surgical and safe**.

---

## 5️⃣ Optimized Context Window Strategy

### Context Sources (Ranked)

1. Task description
2. File chunk (not whole file)
3. Recent diffs (last 3 edits)
4. Error logs (if any)

🚫 **Never send:**

- node_modules
- generated files
- compiled output

---

## 6️⃣ Execution Layer (Terminal Control)

You need **real execution**, not fake.

### Backend (Node.js)

```tsx
child_process.spawn("npm", ["install", "zustand"])
child_process.spawn("npm", ["run", "dev"])

```

Security:

- Run inside **Docker sandbox**
- Read-only FS except `/workspace`

---

## 7️⃣ Live Preview System

### How bolt.new actually does it

```
Vite Dev Server
   ↓
localhost:5173
   ↓
Reverse Proxy
   ↓
Iframe in frontend

```

Implementation:

- Backend exposes `/preview`
- Frontend iframe points to it

---

## 8️⃣ Error Ingestion & Self-Healing Loop

### Error Flow

```
Vite Error / TS Error
   ↓
Parse Stacktrace
   ↓
Map file + line
   ↓
Send to Debug Agent
   ↓
Generate patch
   ↓
Apply diff
   ↓
Restart dev server

```

⚠️ Only send:

- Error message
- File path
- Relevant chunk

---

## 9️⃣ Tooling Choices (Brutally Honest)

### ✅ Use These

| Tool | Why |
| --- | --- |
| **LangGraph** | Perfect for agent DAGs |
| **Tree-sitter** | Precise code chunking |
| **diff-match-patch** | Reliable diffs |
| **Chromadb** | Local + cheap |
| **Gemini API** | Strong code reasoning |

---

### ❌ Avoid These (for now)

| Tool | Why |
| --- | --- |
| AutoGen | Too autonomous, hard to control |
| Pinecone | Overkill + costly |
| Convex | Not needed for infra |
| Ingest frameworks | You don’t need heavy RAG |

---

## 🔟 Final Recommended Architecture Stack

### Backend

- Node.js + Express
- LangGraph (agent orchestration)
- Tree-sitter (AST)
- Docker sandbox
- Gemini API

### Frontend

- Vite + React
- Monaco Editor
- File Tree
- Preview iframe

### AI Design

- Planner Agent
- Clarifier Agent
- Code Agent (diff-only)
- Debug Agent

---

## 11️⃣ Build Order (IMPORTANT)

### Phase 1 (Foundation)

✅ File system

✅ Diff engine

✅ Gemini code edits

### Phase 2

✅ Planner + Clarifier

✅ Task DAG

### Phase 3

✅ Terminal execution

✅ Live preview

### Phase 4

✅ Error ingestion loop

✅ Self-healing

---

## 12️⃣ Reality Check (Honest)

This is:

- ❌ Not a weekend project
- ✅ 6–8 weeks for MVP
- 🔥 Extremely impressive portfolio project
- 💯 Recruiter magnet (AI + Infra + Systems)

---

If you want, next I can:

1️⃣ Draw a **full LangGraph DAG**

2️⃣ Give **exact Gemini prompt templates**

3️⃣ Provide **code skeleton repo structure**

4️⃣ Show **how Cursor implements diffs**

Just tell me which one you want first 🚀
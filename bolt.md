# Bolt.new Clone - Complete MVP Documentation & Architecture Guide

## Executive Summary

This document outlines the complete architecture and implementation strategy for building a browser-based AI-powered code editor that enables users to create, edit, and preview web applications in real-time. The application combines a Monaco-based code editor, WebContainer runtime environment, and AI-driven inline code editing capabilities to provide a seamless development experience similar to Bolt.new and Cursor.

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

The application follows a client-side architecture with three primary layers:

**Presentation Layer**: User interface components including the editor, file tree, preview panel, and AI chat interface

**Application Layer**: Business logic for file management, AI integration, diff calculation, and state management

**Runtime Layer**: WebContainer environment for executing code and serving preview applications

### 1.2 Component Hierarchy

The system is organized into distinct, loosely-coupled modules:

- **Editor Module**: Handles all code editing functionality
- **File System Module**: Manages virtual file structure and operations
- **Preview Module**: Executes code and displays live preview
- **AI Module**: Integrates with Gemini API for code generation and modification
- **Diff Module**: Calculates and displays code changes
- **UI Shell**: Orchestrates all modules and manages layout

### 1.3 Data Flow Architecture

The application follows a unidirectional data flow pattern:

1. User interactions trigger actions in the UI
2. Actions update centralized state
3. State changes propagate to relevant components
4. Components re-render with updated data
5. Side effects (AI calls, file operations) are handled asynchronously

---

## 2. Core Components Deep Dive

### 2.1 Code Editor Component

**Technology Choice**: Monaco Editor is the optimal choice as it's the same engine powering Visual Studio Code. It provides enterprise-grade editing features out of the box.

**Key Capabilities Required**:

- **Syntax Highlighting**: Monaco provides automatic syntax highlighting for 50+ languages based on file extensions
- **IntelliSense**: Auto-completion, parameter hints, and quick info powered by TypeScript language services
- **Multi-file Support**: Tab-based interface where each file opens in its own editor instance
- **Error Markers**: Visual indicators for syntax errors, warnings, and linting issues
- **Minimap**: Code overview for quick navigation in large files
- **Search and Replace**: Built-in find/replace with regex support
- **Custom Keybindings**: Configurable keyboard shortcuts

**Architecture Considerations**:

The editor should be implemented as a controlled component where the parent component manages the file content state. Each file maintains its own editor model to preserve undo/redo history independently. When switching between files, the editor instance is reused but the model is swapped.

**Performance Optimization**:

For large files, Monaco automatically implements virtualization. However, you should implement lazy loading for file content—only load file content into memory when the file is opened. Implement debouncing for auto-save functionality to avoid excessive state updates.

### 2.2 File System Management

**Virtual File System Design**:

The application maintains an in-memory representation of the project file structure that mirrors what would exist on disk. This virtual file system serves as the single source of truth for all file operations.

**Data Structure**:

The file system should be represented as a tree structure where each node can be either a file or directory. Files contain content and metadata (language, last modified, size). Directories contain child nodes.

**Operations Required**:

- **Create**: Add new files or directories at specified paths
- **Read**: Retrieve file content and metadata
- **Update**: Modify file content
- **Delete**: Remove files or directories (recursive for directories)
- **Rename**: Change file or directory names
- **Move**: Relocate files between directories

**Synchronization Strategy**:

The virtual file system must be kept in sync with the WebContainer file system. Every operation on the virtual file system should trigger a corresponding operation in WebContainer. This ensures the preview environment always has the latest code.

**Conflict Resolution**:

When AI makes changes to files, implement optimistic updates where the UI immediately reflects changes but can roll back if the WebContainer operation fails. Track pending operations and show visual indicators for unsaved changes.

### 2.3 WebContainer Integration

**What Are WebContainers**:

WebContainers are a WebAssembly-based operating system that runs entirely in the browser. It provides a complete Node.js environment including npm, file system access, and network capabilities without requiring server-side infrastructure.

**Boot Process**:

When the application loads, a WebContainer instance must be initialized. This is an asynchronous operation that involves loading the WebAssembly runtime and setting up the virtual file system. The boot process typically takes 1-3 seconds.

**File System Mounting**:

After boot, the entire project file structure is mounted to the WebContainer. This involves writing all files from your virtual file system into WebContainer's file system. Use the mount API which efficiently handles directory structures.

**Package Management**:

WebContainers support npm operations. When a new project is created from a template, the package.json dependencies must be installed. This is done by spawning an npm install process within the WebContainer. The installation progress can be streamed to a terminal UI component.

**Development Server**:

Once dependencies are installed, spawn the development server process (typically "npm run dev" for Vite projects). WebContainer will start the dev server and expose it through a unique URL. This URL is used as the source for the preview iframe.

**Process Management**:

WebContainers allow spawning and managing multiple processes. You can run the dev server, linting, testing, and other processes concurrently. Each process provides streams for stdout, stderr, and stdin allowing full terminal interaction.

**Limitations to Consider**:

WebContainers have some restrictions: no native binaries, limited file system performance compared to native, and memory constraints in the browser. Design your application to work within these limitations by keeping project sizes reasonable and avoiding heavy build processes.

### 2.4 Preview Panel

**iframe-based Isolation**:

The preview runs in an iframe to provide security isolation and prevent preview code from interfering with the editor application. The iframe source is set to the URL provided by WebContainer's dev server.

**Hot Module Replacement**:

Vite's dev server includes HMR (Hot Module Replacement) by default. When files change in WebContainer, Vite detects the changes and pushes updates to the preview iframe without full page reloads. This provides instant feedback.

**Error Overlay**:

Vite displays compilation errors as overlays in the preview iframe. You can capture these errors by listening to console messages from the iframe and display them in your own error panel for better visibility.

**Responsive Preview**:

Implement viewport controls that allow users to preview their application at different screen sizes. This involves resizing the iframe and setting appropriate viewport meta tags.

**Device Emulation**:

Provide presets for common device sizes (mobile, tablet, desktop) and allow custom dimensions. Implement device frame overlays to simulate how the app would look on actual devices.

**Console Integration**:

Capture console.log, console.error, and other console methods from the preview iframe and display them in a dedicated console panel. This requires establishing a message passing channel between the iframe and parent window.

### 2.5 File Tree Navigator

**Visual Representation**:

The file tree displays the project structure in a collapsible tree format. Directories can be expanded or collapsed. Files are leaf nodes that can be clicked to open in the editor.

**Virtual Scrolling**:

For large projects with many files, implement virtual scrolling where only visible tree nodes are rendered. This prevents performance degradation with large file trees.

**Context Menus**:

Right-clicking on files or folders should show context menus with relevant actions: rename, delete, duplicate, create new file/folder. The available actions depend on whether a file or folder is selected.

**Drag and Drop**:

Support dragging files and folders to reorganize the project structure. This involves detecting drag events, showing drop targets, and updating both the virtual file system and WebContainer when drops occur.

**File Icons**:

Display appropriate icons based on file types. Use icon libraries or implement custom icon mapping based on file extensions. This improves scanability and helps users quickly identify file types.

**Search Functionality**:

Implement fuzzy search across file names for quick navigation in large projects. As users type, filter the tree to show only matching files and their parent directories.

---

## 3. AI Integration Architecture

### 3.1 Gemini API Integration

**Why Gemini**:

Google's Gemini API offers competitive code generation capabilities with a generous free tier. Gemini 1.5 Flash is optimized for speed while Gemini 1.5 Pro provides higher quality outputs. For MVP, Flash is recommended due to faster response times.

**Authentication**:

Gemini API uses API key authentication. Keys should be stored securely and never exposed in client-side code. For an MVP, you can implement a simple backend proxy that adds the API key to requests, or use environment variables with build-time injection if not concerned about key exposure.

**Request Structure**:

Gemini API accepts requests with a contents array containing message parts. Each part can be text, inline data (for images), or function calls. For code editing, you'll primarily use text parts containing the prompt.

**Response Handling**:

Responses include candidates array with generated content. Extract the text from the first candidate's content parts. Handle safety ratings and finish reasons to detect when content is blocked or generation is incomplete.

**Token Management**:

Monitor token usage to stay within rate limits. Implement token counting before sending requests to ensure prompts fit within context windows. Gemini's context window is large enough for most single-file editing tasks.

**Streaming Responses**:

Implement streaming to show AI responses as they're generated rather than waiting for completion. This improves perceived performance. Stream handling requires processing Server-Sent Events from the API.

### 3.2 Prompt Engineering for Code Editing

**Context Provision**:

Every prompt must include sufficient context for the AI to understand what to modify. This includes the current file content, file path, programming language, and user instructions. The more context provided, the better the results.

**Instruction Clarity**:

User instructions should be processed and clarified before sending to the AI. Ambiguous requests like "make it better" should trigger clarifying questions. Specific requests like "add error handling to the login function" work best.

**Output Format Specification**:

Explicitly instruct the AI on the expected output format. For single-file edits, request only the modified code without explanations or markdown formatting. For multi-file operations, specify a structured format with clear file delimiters.

**Code Preservation**:

Emphasize that the AI should preserve unchanged code exactly as-is. This is critical for accurate diff calculation. Instruct the AI to make minimal changes necessary to fulfill the request.

**Language-Specific Instructions**:

Include language-specific guidelines in prompts. For JavaScript, mention preference for modern ES6+ syntax. For CSS, specify whether to use Tailwind classes or custom CSS. These guidelines ensure consistent code style.

**Error Context**:

When fixing errors, include the error message, stack trace, and relevant surrounding code. This helps the AI understand the root cause and provide accurate fixes.

### 3.3 Code Generation Strategies

**Template-Based Generation**:

Instead of generating projects from scratch, use pre-built templates. Templates ensure consistent project structure, proper configuration, and working boilerplate. Templates should include all necessary dependencies, build configuration, and starter components.

**Incremental Generation**:

Generate code incrementally rather than entire applications at once. Start with basic structure, then add features one at a time. This allows for course correction and reduces the chance of generation errors.

**Component-Level Generation**:

Focus on generating individual components rather than complete pages. Smaller scope means higher quality and easier debugging. Users can request multiple components and compose them manually.

**Style Consistency**:

Maintain consistent code style by including style guide rules in prompts. Specify preferences for naming conventions, code organization, and formatting. This makes generated code feel cohesive with manually written code.

**Dependency Management**:

When generating code that requires new dependencies, the AI should indicate which packages need to be installed. Implement automatic package.json updates and dependency installation when new packages are required.

### 3.4 Multi-Turn Conversations

**Conversation History**:

Maintain a conversation history that includes all previous messages and AI responses. This context allows the AI to understand references to previous changes and maintain continuity across multiple edits.

**Context Window Management**:

As conversations grow, the context window fills up. Implement intelligent truncation that keeps recent messages and critical context (like current file content) while removing older less-relevant messages.

**Conversation Branching**:

Allow users to branch conversations at any point. This enables exploring alternative approaches without losing the main conversation thread. Each branch maintains its own history and file state.

**Conversation Reset**:

Provide options to start fresh conversations while preserving project state. This is useful when switching to a different part of the codebase or changing task focus.

---

## 4. Inline Editing System

### 4.1 Diff Calculation

**Diff Algorithms**:

Use the Myers diff algorithm (implemented in diff-match-patch library) to calculate differences between old and new code. This algorithm finds the minimal set of changes needed to transform one text into another.

**Granularity Levels**:

Calculate diffs at multiple granularities: character-level for small changes, line-level for structural changes, and block-level for large refactors. Choose the appropriate granularity based on the extent of changes.

**Semantic Cleanup**:

After calculating raw diffs, apply semantic cleanup algorithms that make diffs more human-readable. This merges adjacent changes and adjusts boundaries to follow code structure (like keeping function definitions together).

**Whitespace Handling**:

Implement intelligent whitespace handling that ignores irrelevant whitespace changes (like trailing spaces or empty lines) while preserving significant whitespace (indentation, line breaks in strings).

### 4.2 Diff Visualization

**Inline Diff View**:

Display changes directly within the code editor using background colors. Deleted lines get red backgrounds, added lines get green backgrounds, and modified lines get yellow backgrounds with character-level highlights.

**Side-by-Side View**:

Offer a side-by-side comparison mode showing original and modified code in parallel panels. This is useful for reviewing large changes where inline view becomes cluttered.

**Unified Diff View**:

Implement a Git-style unified diff view showing removed lines prefixed with minus signs and added lines with plus signs. This familiar format helps developers quickly scan changes.

**Syntax Highlighting in Diffs**:

Maintain syntax highlighting even in diff views. This requires re-parsing code after applying diff decorations. Monaco Editor supports this through custom decoration providers.

**Navigation Controls**:

Provide controls to jump between changes (next/previous diff). Display change counters showing number of additions, deletions, and modifications. Allow quick navigation to specific change locations.

### 4.3 Change Acceptance Workflow

**Individual Change Acceptance**:

Allow users to accept or reject changes individually. Each diff hunk should have accept/reject buttons. Accepting applies that specific change while rejecting keeps the original code.

**Bulk Operations**:

Provide options to accept all changes or reject all changes at once. This is faster for cases where user wants to apply everything or start over completely.

**Partial Acceptance**:

For large changes, allow accepting some hunks while rejecting others. Track which changes are accepted/pending/rejected. Show visual indicators for each state.

**Undo/Redo for Acceptances**:

Maintain an acceptance history that allows undoing accepted changes. This is separate from editor undo/redo and specifically tracks diff acceptance actions.

**Preview Before Accept**:

Show a preview of what the code will look like after accepting changes. For React components, this could include a live preview update showing how the UI will change.

### 4.4 Multi-File Diff Management

**Diff Queue**:

When AI modifies multiple files, create a queue of pending diffs. Users review and accept/reject diffs file by file. Show progress through the queue with visual indicators.

**File Navigation**:

Implement easy navigation between files with pending changes. Highlight files in the file tree that have pending diffs. Provide keyboard shortcuts to jump between files.

**Dependency-Aware Ordering**:

When multiple files change, order them by dependency relationships. Review changes to shared utilities before components that use them. This helps users understand cascading impacts.

**Batch Acceptance**:

Allow accepting all changes across all files at once for cases where user trusts the AI completely. Provide a review summary showing which files will change before bulk acceptance.

---

## 5. State Management Architecture

### 5.1 State Structure

**File System State**:

Store the complete virtual file system including file contents, directory structure, and metadata. This is the source of truth for all file operations.

**Editor State**:

Track open files, active file, cursor positions, selections, and scroll positions. Preserve these across file switches so users return to where they left off.

**UI State**:

Manage panel visibility, sizes, themes, and layout preferences. Store user preferences like editor font size, theme, and keybindings.

**AI State**:

Maintain conversation history, pending AI requests, and generated code waiting for acceptance. Track AI request status (idle, loading, streaming, complete, error).

**Preview State**:

Store WebContainer status, preview URL, console logs, and compilation errors. Track whether preview is loading, ready, or failed.

### 5.2 State Updates and Synchronization

**Optimistic Updates**:

Apply UI updates immediately before confirming with WebContainer. If WebContainer operations fail, roll back the optimistic update and show error messages.

**Eventual Consistency**:

Accept that different parts of the system may be temporarily out of sync. File changes appear in the editor before WebContainer updates, which happens before preview updates. Design UI to handle these intermediate states gracefully.

**Conflict Resolution**:

When multiple changes attempt to modify the same file (rare in single-user scenarios but possible with AI edits during manual editing), implement last-write-wins or prompt user to choose which version to keep.

**State Persistence**:

Persist project state to browser localStorage to survive page refreshes. Serialize the file system, open files, and user preferences. Restore state on application load.

### 5.3 Change Tracking

**Edit History**:

Maintain a history of all file changes with timestamps and descriptions. This enables undo/redo across the entire project, not just within individual files.

**Dirty State Tracking**:

Track which files have unsaved changes. Display visual indicators (dots, asterisks) on file tabs and in the file tree for dirty files. Prevent navigation away with unsaved changes.

**Auto-Save Strategy**:

Implement auto-save that periodically persists changes to localStorage. Debounce auto-save to avoid excessive saves during active typing. Show last saved timestamps in the UI.

---

## 6. Template System

### 6.1 Template Structure

**Template Components**:

Each template includes: complete file system structure, package.json with dependencies, configuration files (vite.config, tailwind.config), boilerplate components, and initial content for key files.

**Configuration Flexibility**:

Templates should be configurable with options like TypeScript vs JavaScript, different styling approaches (Tailwind, CSS Modules, Styled Components), and various UI libraries (none, Material-UI, Chakra UI).

**Template Metadata**:

Store metadata for each template including name, description, preview image, technologies used, and recommended use cases. Display this in a template selection UI.

### 6.2 Template Initialization

**Cloning Process**:

When user selects a template, deep clone the template's file structure to create a new independent project. Ensure no shared references between projects.

**Dependency Installation**:

After cloning files to WebContainer, automatically trigger npm install. Show installation progress in a terminal panel. Handle installation errors gracefully with retry options.

**Initial Build**:

Some templates require an initial build step before the dev server starts. Execute these build steps automatically and show progress. Only start the dev server after successful builds.

### 6.3 Template Customization

**Project Naming**:

Allow users to name their project during initialization. Update package.json and other files that reference the project name. Use the name for localStorage keys.

**Template Extensions**:

Provide options to include optional features like routing, state management, API integration, or authentication during template initialization. These are add-ons to the base template.

**Custom Templates**:

Allow users to save their current project as a custom template for future reuse. Store custom templates separately from built-in templates. Enable sharing custom templates.

---

## 7. Error Handling and Debugging

### 7.1 Compilation Errors

**Error Detection**:

Listen to output from WebContainer processes to detect compilation errors. Parse error messages to extract file paths, line numbers, and error descriptions.

**Error Markers**:

Display error markers in the Monaco Editor at the exact line and column where errors occur. Use squiggly underlines for syntax errors and warning markers for potential issues.

**Error Panel**:

Maintain an error panel that lists all current errors across all files. Each error should be clickable to jump to the problematic code. Show error counts in the status bar.

**Error Context**:

When displaying errors, show surrounding code context to help users understand the issue. Highlight the specific code segment causing the error.

### 7.2 Runtime Errors

**Console Error Capture**:

Capture console.error calls from the preview iframe. Display these in a dedicated console panel. Group similar errors and show occurrence counts.

**Stack Traces**:

Parse JavaScript stack traces to show clickable links to source files and line numbers. Use source maps if available to map back to original code.

**Error Boundaries**:

For React projects, suggest implementing error boundaries. When runtime errors occur in the preview, provide options to add error boundaries around problematic components.

### 7.3 AI-Assisted Debugging

**Error Analysis**:

When errors occur, offer an AI-powered analysis option. Send the error message, stack trace, and relevant code to Gemini for diagnosis and suggested fixes.

**Automated Fixes**:

For common errors (missing imports, syntax errors, undefined variables), generate automatic fixes and present them as diff suggestions. Users can accept fixes with one click.

**Fix Explanations**:

When suggesting fixes, include brief explanations of what caused the error and why the fix resolves it. This helps users learn and avoid similar issues.

### 7.4 Debug Tools

**Network Inspection**:

Provide tools to inspect network requests made by the preview application. Show request/response details, timing, and status codes. Useful for debugging API integrations.

**Performance Monitoring**:

Display basic performance metrics like bundle size, load time, and render performance. Alert users to performance issues and suggest optimizations.

---

## 8. User Experience Enhancements

### 8.1 Keyboard Shortcuts

**Essential Shortcuts**:

Implement standard IDE shortcuts: Ctrl/Cmd+S for save, Ctrl/Cmd+P for quick file open, Ctrl/Cmd+F for find, Ctrl/Cmd+Shift+F for find in files, Ctrl/Cmd+/ for toggle comment.

**Custom Shortcut Configuration**:

Allow users to customize keyboard shortcuts through a settings panel. Provide preset collections mimicking popular editors (VS Code, Sublime, Vim).

**Shortcut Discovery**:

Show available shortcuts in context menus and tooltips. Implement a command palette (like VS Code) that shows all available commands and their shortcuts.

### 8.2 Theme Customization

**Built-in Themes**:

Provide several built-in themes covering light and dark options. Popular choices include VS Code Light, VS Code Dark, Monokai, and Solarized.

**Custom Themes**:

Allow users to customize colors for syntax highlighting, editor background, UI elements, and terminal. Provide a theme editor with live preview.

**Theme Synchronization**:

Keep the editor theme and application UI theme consistent. When user switches to dark mode, update both the code editor and surrounding interface.

### 8.3 Responsive Design

**Panel Resizing**:

Implement draggable splitters between panels (editor, preview, file tree). Save panel sizes in user preferences and restore on next session.

**Panel Visibility Toggles**:

Provide options to show/hide panels to maximize space for focused work. Common toggles include file tree, terminal, error panel, and AI chat.

**Mobile Considerations**:

For mobile devices, use tab-based navigation instead of split panes. Allow switching between editor view and preview view. Optimize touch interactions for file tree and editor.

### 8.4 Loading and Progress Indicators

**Skeleton Screens**:

Use skeleton screens during initial load to show the application structure while components load. This provides immediate visual feedback and reduces perceived load time.

**Progress Bars**:

Show progress bars for long operations: WebContainer boot, dependency installation, large file operations. Include percentage complete and estimated time remaining.

**Status Messages**:

Display status messages for background operations. Examples: "Installing dependencies...", "Starting dev server...", "AI is generating code...". Keep users informed of what's happening.

---

## 9. Performance Optimization

### 9.1 Code Splitting

**Route-Based Splitting**:

Split the application by major routes or sections. Load the editor components only when entering editor view. Lazy load the AI chat when first opened.

**Component Lazy Loading**:

Use dynamic imports for large components that aren't needed immediately. Examples: diff viewer, terminal emulator, settings panel.

**Library Code Splitting**:

Separate vendor libraries from application code. Monaco Editor is particularly large and benefits from being in its own chunk with aggressive caching.

### 9.2 Memory Management

**Editor Instance Reuse**:

Reuse the Monaco Editor instance when switching files rather than destroying and recreating. Swap the underlying model which is much more efficient.

**File Content Lazy Loading**:

Don't load all file contents into memory at once. Load content when files are opened. Keep a cache of recently accessed files and unload rarely used files.

**Virtual Scrolling**:

Implement virtual scrolling for long file lists, log outputs, and large file contents. Only render visible items to reduce DOM size and memory usage.

### 9.3 Network Optimization

**API Request Batching**:

Batch multiple AI requests when possible. If user requests changes to multiple files, combine them into a single API call rather than multiple sequential calls.

**Response Caching**:

Cache AI responses for identical requests. If user asks the same question twice, return cached response instantly. Implement cache invalidation when context changes.

**Request Debouncing**:

Debounce frequent operations like auto-save and file watching. Wait for a pause in activity before executing expensive operations.

### 9.4 Rendering Optimization

**React Optimization Techniques**:

Use React.memo for components that render frequently with same props. Implement shouldComponentUpdate or useMemo for expensive computations. Avoid unnecessary re-renders.

**Virtual DOM Minimization**:

Structure component tree to minimize Virtual DOM nodes. Avoid deeply nested components. Keep component trees shallow and wide rather than deep and narrow.

**Animation Performance**:

Use CSS transforms and opacity for animations (GPU-accelerated). Avoid animating properties that trigger layout or paint. Use will-change for elements that will animate.

---

## 10. Security Considerations

### 10.1 Code Execution Isolation

**iframe Sandbox**:

The preview iframe should use sandbox attributes to restrict capabilities. Enable allow-scripts, allow-same-origin (for Vite HMR), but restrict other permissions like allow-downloads or allow-popups.

**Content Security Policy**:

Implement CSP headers that restrict where scripts can be loaded from. This prevents preview code from loading malicious external scripts.

**Origin Isolation**:

WebContainers run in an isolated origin separate from the main application. This prevents preview code from accessing the editor application's DOM or JavaScript context.

### 10.2 API Key Protection

**Environment Variables**:

Never expose API keys in client-side code. Use environment variables during build or implement a backend proxy that adds keys server-side.

**Request Rate Limiting**:

Implement client-side rate limiting to prevent API key abuse. Track request counts and enforce limits before sending to API. Show warnings when approaching limits.

**Key Rotation**:

Support easy API key rotation. Allow users to provide their own API keys through settings. Validate keys before saving.

### 10.3 Input Sanitization

**XSS Prevention**:

Sanitize user inputs before displaying in the UI. Even though Monaco handles code safely, user-generated content in chat or comments needs sanitization.

**Code Injection**:

Be cautious with eval or Function constructors. Avoid executing user code outside of WebContainer's isolated environment. Never execute AI-generated code in the main application context.

### 10.4 Data Privacy

**Local Storage**:

Store project data in browser localStorage. This keeps user data on their device rather than sending to servers. Implement optional cloud sync only with explicit user consent.

**Prompt Privacy**:

Be transparent about what data is sent to AI APIs. User code and prompts are sent to Gemini. Provide options to exclude certain files from AI context for sensitive information.

---

## 11. Testing Strategy

### 11.1 Unit Testing

**Component Testing**:

Test individual components in isolation. Verify that file tree renders correctly, editor displays code, and preview panel loads iframes. Use React Testing Library.

**State Management Testing**:

Test state management logic separately from UI. Verify file operations, state updates, and synchronization logic. Mock external dependencies like WebContainer.

**Utility Function Testing**:

Test utility functions for diff calculation, file path parsing, and error parsing. These pure functions are easiest to test and should have high coverage.

### 11.2 Integration Testing

**Component Integration**:

Test how components interact. Verify that clicking a file in the tree opens it in the editor, that editor changes update preview, and that AI responses apply correctly.

**WebContainer Integration**:

Test WebContainer operations end-to-end. Verify that files mount correctly, npm install works, and dev server starts. These tests may be slower and require actual WebContainer instances.

**AI Integration Testing**:

Test AI request/response handling with mocked API responses. Verify prompt construction, response parsing, and error handling. Use recorded real responses for realistic testing.

### 11.3 End-to-End Testing

**User Workflows**:

Test complete user workflows like creating a new project, editing files, generating code with AI, accepting changes, and viewing preview. Use Playwright or Cypress.

**Error Scenarios**:

Test error handling by simulating various failure conditions: network errors, API errors, WebContainer failures, invalid code, compilation errors.

**Performance Testing**:

Test performance with large projects, many files, and long editing sessions. Verify that memory usage stays reasonable and UI remains responsive.

---

## 12. Deployment Considerations

### 12.1 Build Configuration

**Production Optimization**:

Configure Vite for production with minification, tree-shaking, and code splitting. Set appropriate chunk sizes and asset optimization settings.

**Asset Optimization**:

Compress images, optimize fonts, and minimize CSS. Use WebP for images with PNG/JPEG fallbacks. Implement lazy loading for non-critical assets.

**Bundle Analysis**:

Use bundle analyzers to identify large dependencies. Look for opportunities to reduce bundle size by removing unused dependencies or replacing large libraries with smaller alternatives.

### 12.2 Hosting Strategy

**Static Hosting**:

The application is entirely client-side and can be hosted on static hosting services like Vercel, Netlify, Cloudflare Pages, or GitHub Pages. No backend infrastructure needed.

**CDN Configuration**:

Serve assets through CDN for global distribution. Configure caching headers appropriately—long cache for versioned assets, short cache for HTML.

**Environment Configuration**:

Set up different environments (development, staging, production) with appropriate configurations. Use environment-specific API endpoints and feature flags.

### 12.3 Monitoring and Analytics

**Error Tracking**:

Implement error tracking with services like Sentry. Capture JavaScript errors, API failures, and WebContainer issues. Include context like browser version and user actions.

**Usage Analytics**:

Track feature usage to understand how users interact with the application. Monitor which templates are popular, how often AI features are used, and where users spend time.

**Performance Monitoring**:

Monitor real-user performance metrics: page load time, time to interactive, WebContainer boot time, API response times. Set up alerts for performance degradation.

---

## 13. Future Enhancements

### 13.1 Collaboration Features

**Real-Time Collaboration**:

Implement real-time collaborative editing similar to Google Docs. Multiple users can edit the same project simultaneously with cursor positions and selections visible.

**Presence Indicators**:

Show which users are currently viewing or editing which files. Display avatars and names in the file tree and editor.

**Collaboration Permissions**:

Implement permission levels: view-only, edit, admin. Control who can make changes, invite others, or modify project settings.

### 13.2 Version Control

**Git Integration**:

Integrate Git operations: commit, push, pull, branch management. Provide visual diff views for commits. Show commit history in a dedicated panel.

**Change History**:

Maintain detailed change history beyond undo/redo. Allow reverting to any previous state. Show timeline of changes with descriptions.

**Branch Management**:

Support creating and switching between branches. Maintain separate WebContainer instances for each branch to allow quick switching.

### 13.3 Advanced AI Features

**Code Review**:

AI-powered code review that suggests improvements for readability, performance, security, and best practices. Highlight potential issues and provide refactoring suggestions.

**Test Generation**:

Automatically generate unit tests for functions and components. AI analyzes code and creates test cases covering edge cases and common scenarios.

**Documentation Generation**:

Generate JSDoc comments, README files, and inline documentation. AI extracts component props, function parameters, and generates descriptive documentation.

### 13.4 Deployment Integration

**One-Click Deploy**:

Integrate with deployment platforms like Vercel, Netlify, or Cloudflare Pages. Allow deploying projects with a single click directly from the editor.

**Custom Domains**:

Support connecting custom domains to deployed projects. Manage DNS settings and SSL certificates.

**Deployment History**:

Track deployment history with rollback capabilities. Preview deployments before making them live.

---

## 14. Implementation Priorities

### 14.1 Must-Have Features (Core MVP)

1. Monaco Editor with syntax highlighting and basic editing features
2. File tree with create, delete, rename operations
3. WebContainer integration with preview panel
4. Single template (React + Vite + Tailwind)
5. Basic AI integration for code generation
6. Simple diff view for AI changes
7. Error display in editor and console panel

### 14.2 Should-Have Features (Enhanced MVP)

1. Multiple templates to choose from
2. Inline diff editing with accept/reject
3. Multi-file AI operations

4. Keyboard shortcuts
5. Theme customization
6. Auto-save and state persistence
7. AI-assisted error fixing

### 14.3 Nice-to-Have Features (Future Iterations)

1. Real-time collaboration
2. Git integration
3. Custom template creation
4. Advanced debugging tools
5. Performance profiling
6. One-click deployment
7. Test generation

---

## 15. Technical Dependencies Summary

### 15.1 Core Libraries

- **React**: UI framework
- **Vite**: Build tool and dev server
- **Monaco Editor**: Code editor component
- **WebContainers API**: Browser-based runtime environment
- **Zustand**: Lightweight state management
- **TailwindCSS**: Styling framework

### 15.2 Supporting Libraries

- **diff-match-patch**: Diff calculation algorithm
- **react-resizable-panels**: Resizable panel layouts
- **lucide-react**: Icon library
- **xterm**: Terminal emulator (optional)
- **prettier**: Code formatting
- **eslint**: Code linting

### 15.3 Development Tools

- **TypeScript**: Type safety
- **Vitest**: Unit testing
- **Playwright**: E2E testing
- **ESLint + Prettier**: Code quality tools

---

This documentation provides a comprehensive blueprint for building a Bolt.new clone MVP. The architecture prioritizes simplicity, performance, and user experience while maintaining flexibility for future enhancements. Focus on implementing the core features first, then iteratively add enhanced capabilities based on user feedback and requirements.
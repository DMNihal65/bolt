import google.generativeai as genai
import os
import json
import re
import difflib
from typing import List, Dict, Any, Optional
from services.rate_limiter import get_rate_limiter

# Planning prompt - now includes context and recent changes
PLANNING_PROMPT = """You are an expert AI coding assistant that plans complex UI development tasks.

Given a user request, you must:
1. Analyze what they want to build or fix
2. Look at the provided file contents to understand the current code
3. Break it down into specific file-by-file tasks
4. Only ask for clarification if ABSOLUTELY necessary (try to infer from context)

OUTPUT FORMAT (JSON only):
{
  "understanding": "Your understanding of what the user wants",
  "needs_clarification": true/false,
  "clarification_question": "Question to ask user (if needs_clarification is true)",
  "tasks": [
    {
      "id": 1,
      "type": "file" | "command",
      "description": "What this task does",
      "file": "src/components/MyComponent.jsx",
      "action": "create" | "update" | "delete",
      "command": "npm install package-name",
      "dependencies": []
    }
  ],
  "estimated_complexity": "simple" | "medium" | "complex"
}

CRITICAL FILE PATH RULES:
- ALL file paths MUST start with "src/" - this is required for Vite
- CORRECT: "src/App.jsx", "src/components/TodoItem.jsx"
- INCORRECT: "App.jsx", "components/TodoItem.jsx" (NEVER!)

PRE-INSTALLED SHADCN COMPONENTS (just import, don't install):
- Button, Card, Input, Badge, Separator, Label, Checkbox, Textarea, Dialog, Table
- Import from '@/components/ui/component-name'

IMPORTANT CONTEXT RULES:
- When user asks to "fix" something, look at the RECENT CHANGES and CURRENT FILES sections
- The RECENT CHANGES show what was just created/modified
- Use the file contents provided to understand what needs fixing
- Don't ask for clarification if you can see the relevant code
- For bug fixes, look at the actual code to find the issue

RULES:
- Each task modifies ONE file
- Order: shared components first, App.jsx last
- Only use "command" for npm install (not npx shadcn)
- DO NOT ask for clarification if you can infer from context
"""

# Diff-based execution prompt
EXECUTION_PROMPT_DIFF = """You are an expert React developer. You are updating a file.

TASK: {task_description}
FILE: {file_path}

CURRENT FILE CONTENT:
```
{current_content}
```

PREVIOUS CHANGES CONTEXT:
{context}

OUTPUT FORMAT - Generate ONLY the changes needed using SEARCH/REPLACE blocks:
{{
  "thinking": "Brief explanation of your approach",
  "changes": [
    {{
      "search": "EXACT code block to find (copy character-for-character including whitespace)",
      "replace": "The new code to replace it with"
    }}
  ],
  "summary": "One-line summary of changes made"
}}

CRITICAL RULES:
1. The "search" must EXACTLY match existing code (including whitespace/indentation)
2. Include enough context in "search" to be unique (2-5 lines usually)
3. For MULTIPLE changes, include multiple search/replace objects
4. USE JSX NOT TYPESCRIPT - no type annotations or interfaces
5. Write CLEAN code - no excessive comments
6. Use TailwindCSS for styling
7. Import from '@/components/ui/' for UI components
8. Import from '@/lib/utils' for cn() function
"""

# For NEW files
EXECUTION_PROMPT_CREATE = """You are an expert React developer. Create a new file.

TASK: {task_description}
FILE: {file_path}

PREVIOUS CHANGES CONTEXT:
{context}

OUTPUT FORMAT (JSON only):
{{
  "thinking": "Brief explanation of your approach",
  "file_content": "The complete file content",
  "summary": "One-line summary of what the file does"
}}

CRITICAL RULES:
1. USE JSX NOT TYPESCRIPT - file extensions are .jsx, NOT .tsx
2. NO TypeScript types, interfaces, or type annotations
3. Write CLEAN, MINIMAL code - no excessive comments or documentation
4. Use TailwindCSS for all styling (className="...")
5. Use modern React (useState, useEffect, functional components)
6. Import UI components from '@/components/ui/component-name'
7. Import cn() from '@/lib/utils' for conditional classes
8. Make the UI beautiful with good colors, spacing, and typography
9. Export components as default: export default ComponentName

IMPORT EXAMPLES:
- import {{ Button }} from '@/components/ui/button'
- import {{ Card, CardHeader, CardTitle, CardContent }} from '@/components/ui/card'
- import {{ Input }} from '@/components/ui/input'
- import {{ Checkbox }} from '@/components/ui/checkbox'
- import {{ cn }} from '@/lib/utils'
"""


def apply_diff(original_content: str, search_block: str, replace_block: str) -> tuple[str, bool]:
    """Apply a search/replace diff to the original content."""
    if not original_content:
        return replace_block, True
    
    if not search_block:
        return replace_block + original_content, True
    
    # Normalize line endings
    original_content = original_content.replace('\r\n', '\n')
    search_block = search_block.replace('\r\n', '\n')
    replace_block = replace_block.replace('\r\n', '\n')
    
    # Try exact match first
    if search_block in original_content:
        return original_content.replace(search_block, replace_block, 1), True
    
    # Try with flexible whitespace
    original_lines = original_content.split('\n')
    search_lines = [line.strip() for line in search_block.split('\n') if line.strip()]
    
    best_match_start = -1
    best_match_score = 0
    
    for i in range(len(original_lines) - len(search_lines) + 1):
        window = original_lines[i:i + len(search_lines)]
        stripped_window = [line.strip() for line in window]
        
        matches = sum(1 for a, b in zip(stripped_window, search_lines) if a == b)
        score = matches / len(search_lines) if search_lines else 0
        
        if score > best_match_score:
            best_match_score = score
            best_match_start = i
    
    if best_match_score >= 0.8 and best_match_start >= 0:
        result_lines = (
            original_lines[:best_match_start] + 
            replace_block.split('\n') + 
            original_lines[best_match_start + len(search_lines):]
        )
        return '\n'.join(result_lines), True
    
    return original_content, False


def apply_multiple_diffs(original_content: str, changes: List[dict]) -> tuple[str, List[dict]]:
    """Apply multiple search/replace diffs in order."""
    content = original_content
    failed = []
    
    for change in changes:
        search = change.get('search', '')
        replace = change.get('replace', '')
        
        new_content, success = apply_diff(content, search, replace)
        
        if success:
            content = new_content
        else:
            failed.append(change)
    
    return content, failed


class Agent:
    def __init__(self):
        self.rate_limiter = get_rate_limiter()
        self.model = None
        self.context = []  # Store task summaries
        self.recent_files = {}  # Store recently modified file contents
        self.current_plan = None
        self._configure_model()
    
    def _configure_model(self):
        """Configure the model with the current API key"""
        api_key = self.rate_limiter.get_current_key()
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
    
    def _parse_json(self, text: str) -> dict:
        """Extract and parse JSON from response"""
        text = text.strip()
        if text.startswith('```json'):
            text = text[7:]
        if text.startswith('```'):
            text = text[3:]
        if text.endswith('```'):
            text = text[:-3]
        text = text.strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', text)
            if match:
                try:
                    return json.loads(match.group())
                except:
                    pass
            return {"error": "Failed to parse", "raw": text[:500]}
    
    async def _generate_with_retry(self, prompt: str) -> str:
        """Generate content with automatic retry and rate limit handling"""
        
        async def _do_generate():
            self._configure_model()
            response = self.model.generate_content(prompt)
            return response.text
        
        return await self.rate_limiter.execute_with_retry(_do_generate)
    
    def _get_relevant_files(self, current_files: Dict[str, str], max_files: int = 5) -> str:
        """Get the most relevant file contents for context.
        Prioritizes: App.jsx, recently modified files, and component files."""
        
        if not current_files:
            return ""
        
        priority_files = []
        other_files = []
        
        for path, content in current_files.items():
            # Skip node_modules and config files
            if 'node_modules' in path or path.endswith('.json') or path.endswith('.config.js'):
                continue
            
            content_str = content if isinstance(content, str) else content.get('content', '')
            
            # High priority files
            if path == 'src/App.jsx' or path in self.recent_files:
                priority_files.append((path, content_str))
            elif '/components/' in path and path.endswith('.jsx'):
                other_files.append((path, content_str))
        
        # Combine priority and other files
        selected_files = priority_files[:3] + other_files[:max_files - len(priority_files)]
        
        if not selected_files:
            return ""
        
        result = "\n\nCURRENT FILE CONTENTS:\n"
        for path, content in selected_files[:max_files]:
            # Truncate large files
            truncated = content[:2000] if len(content) > 2000 else content
            result += f"\n--- {path} ---\n{truncated}\n"
        
        return result
    
    def _get_recent_changes_context(self) -> str:
        """Get summary of recent changes for context"""
        if not self.context:
            return ""
        
        result = "\n\nRECENT CHANGES:\n"
        for c in self.context[-10:]:
            result += f"- {c['file']}: {c['summary']}\n"
        
        return result
    
    async def plan(self, user_request: str, current_files: Dict[str, str] = None) -> dict:
        """Create a plan for the user's request with full context awareness."""
        
        # Build file tree for context
        files_list = list(current_files.keys()) if current_files else []
        file_tree = "\n\nPROJECT FILE TREE:\n" + "\n".join(f"- {f}" for f in files_list[:20]) if files_list else ""
        
        # Get relevant file contents (for follow-up requests)
        file_contents = self._get_relevant_files(current_files)
        
        # Get recent changes context
        recent_changes = self._get_recent_changes_context()
        
        prompt = f"""{PLANNING_PROMPT}
{file_tree}
{recent_changes}
{file_contents}

USER REQUEST: {user_request}

IMPORTANT: If the user is asking to fix something, look at the CURRENT FILE CONTENTS above to understand the code and find the issue. Don't ask for clarification if you can see the relevant code.

Respond with JSON only."""
        
        try:
            response_text = await self._generate_with_retry(prompt)
            plan = self._parse_json(response_text)
            self.current_plan = plan
            return plan
        except Exception as e:
            return {
                "error": str(e),
                "understanding": "Failed to create plan",
                "needs_clarification": False,
                "tasks": []
            }
    
    async def execute_task(self, task: dict, current_content: str = "") -> dict:
        """Execute a single task using DIFF-BASED editing for updates."""
        action = task.get('action', 'update')
        file_path = task.get('file', '')
        
        # Build compact context
        context_str = "\n".join([
            f"- {c['file']}: {c['summary']}" 
            for c in self.context[-5:]
        ]) or "No previous tasks"
        
        # For NEW files, use full content generation
        if action == 'create' or not current_content:
            return await self._execute_create_task(task, context_str)
        
        # For UPDATES, use diff-based editing
        return await self._execute_diff_task(task, current_content, context_str)
    
    async def _execute_create_task(self, task: dict, context_str: str) -> dict:
        """Create a new file"""
        prompt = EXECUTION_PROMPT_CREATE.format(
            task_description=task.get('description', ''),
            file_path=task.get('file', ''),
            context=context_str
        )
        
        try:
            response_text = await self._generate_with_retry(prompt)
            result = self._parse_json(response_text)
            
            file_path = task.get('file', '')
            content = result.get('file_content', '')
            
            # Store in context and recent files
            if 'summary' in result:
                self.context.append({
                    "file": file_path,
                    "summary": result.get('summary')
                })
            
            # Track recently modified files
            self.recent_files[file_path] = content
            
            return {
                "success": True,
                "file": file_path,
                "action": "create",
                "content": content,
                "thinking": result.get('thinking', ''),
                "summary": result.get('summary', '')
            }
        except Exception as e:
            return {
                "success": False,
                "file": task.get('file'),
                "error": str(e)
            }
    
    async def _execute_diff_task(self, task: dict, current_content: str, context_str: str) -> dict:
        """Update a file using diff-based editing."""
        display_content = current_content[:2500] if len(current_content) > 2500 else current_content
        if len(current_content) > 2500:
            display_content += "\n... (file truncated)"
        
        prompt = EXECUTION_PROMPT_DIFF.format(
            task_description=task.get('description', ''),
            file_path=task.get('file', ''),
            current_content=display_content,
            context=context_str
        )
        
        try:
            response_text = await self._generate_with_retry(prompt)
            result = self._parse_json(response_text)
            
            changes = result.get('changes', [])
            
            if not changes:
                return {
                    "success": False,
                    "file": task.get('file'),
                    "error": "No changes provided"
                }
            
            new_content, failed_changes = apply_multiple_diffs(current_content, changes)
            
            file_path = task.get('file', '')
            
            # Store in context
            if 'summary' in result:
                self.context.append({
                    "file": file_path,
                    "summary": result.get('summary')
                })
            
            # Track recently modified files
            self.recent_files[file_path] = new_content
            
            return {
                "success": True,
                "file": file_path,
                "action": "update",
                "content": new_content,
                "thinking": result.get('thinking', ''),
                "summary": result.get('summary', ''),
                "changes_applied": len(changes) - len(failed_changes),
                "changes_failed": len(failed_changes)
            }
        except Exception as e:
            return {
                "success": False,
                "file": task.get('file'),
                "error": str(e)
            }
    
    async def handle_clarification(self, user_response: str) -> dict:
        """Process user's response to clarification question"""
        if not self.current_plan:
            return {"error": "No active plan"}
        
        original_request = self.current_plan.get('understanding', '')
        new_request = f"{original_request}\n\nUser clarification: {user_response}"
        
        return await self.plan(new_request)
    
    def reset(self):
        """Reset the agent state"""
        self.context = []
        self.recent_files = {}
        self.current_plan = None
    
    def get_rate_limit_status(self) -> dict:
        """Get current rate limiter status"""
        return self.rate_limiter.get_status()


# Singleton instance
_agent_instance = None

def get_agent() -> Agent:
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = Agent()
    return _agent_instance

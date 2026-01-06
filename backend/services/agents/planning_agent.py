from .base_agent import BaseAgent
from typing import Dict, List

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

class PlanningAgent(BaseAgent):
    async def plan(self, user_request: str, current_files: Dict[str, str] = None, recent_changes: List[dict] = None) -> dict:
        """Create a plan for the user's request with full context awareness."""
        
        # Build file tree for context
        files_list = list(current_files.keys()) if current_files else []
        file_tree = "\n\nPROJECT FILE TREE:\n" + "\n".join(f"- {f}" for f in files_list[:20]) if files_list else ""
        
        # Get relevant file contents
        file_contents = self._get_relevant_files(current_files)
        
        # Get recent changes context
        recent_changes_str = self._get_recent_changes_context(recent_changes)
        
        prompt = f"""{PLANNING_PROMPT}
{file_tree}
{recent_changes_str}
{file_contents}

USER REQUEST: {user_request}

IMPORTANT: If the user is asking to fix something, look at the CURRENT FILE CONTENTS above to understand the code and find the issue. Don't ask for clarification if you can see the relevant code.

Respond with JSON only."""
        
        try:
            response_text = await self._generate_with_retry(prompt)
            return self._parse_json(response_text)
        except Exception as e:
            return {
                "error": str(e),
                "understanding": "Failed to create plan",
                "needs_clarification": False,
                "tasks": []
            }

    def _get_relevant_files(self, current_files: Dict[str, str], max_files: int = 5) -> str:
        """Get the most relevant file contents for context."""
        if not current_files:
            return ""
        
        priority_files = []
        other_files = []
        
        for path, content in current_files.items():
            if 'node_modules' in path or path.endswith('.json') or path.endswith('.config.js'):
                continue
            
            content_str = content if isinstance(content, str) else content.get('content', '')
            
            if path == 'src/App.jsx':
                priority_files.append((path, content_str))
            elif '/components/' in path and path.endswith('.jsx'):
                other_files.append((path, content_str))
        
        selected_files = priority_files[:3] + other_files[:max_files - len(priority_files)]
        
        if not selected_files:
            return ""
        
        result = "\n\nCURRENT FILE CONTENTS:\n"
        for path, content in selected_files[:max_files]:
            truncated = content # content[:2000] if len(content) > 2000 else content
            result += f"\n--- {path} ---\n{truncated}\n"
        
        return result

    def _get_recent_changes_context(self, recent_changes: List[dict]) -> str:
        """Get summary of recent changes for context"""
        if not recent_changes:
            return ""
        
        result = "\n\nRECENT CHANGES:\n"
        for c in recent_changes[-10:]:
            result += f"- {c['file']}: {c['summary']}\n"
        
        return result

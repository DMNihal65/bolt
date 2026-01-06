from .base_agent import BaseAgent
from typing import List

EXECUTION_PROMPT_DIFF = """You are an expert React developer. You are updating a file.

TASK: {task_description}
FILE: {file_path}

DESIGN GUIDELINES:
{design_guidelines}

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

class EditAgent(BaseAgent):
    async def update_file(self, task: dict, current_content: str, context_str: str, design_guidelines: dict = None) -> dict:
        """Update a file using diff-based editing."""
        
        guidelines_str = ""
        if design_guidelines:
            guidelines_str = "\n".join(f"- {g}" for g in design_guidelines.get('design_guidelines', []))

        display_content = current_content
        # if len(current_content) > 50000:
        #     display_content = current_content[:50000] + "\n... (file truncated)"
        
        prompt = EXECUTION_PROMPT_DIFF.format(
            task_description=task.get('description', ''),
            file_path=task.get('file', ''),
            design_guidelines=guidelines_str,
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
            
            new_content, failed_changes = self._apply_multiple_diffs(current_content, changes)
            
            return {
                "success": True,
                "file": task.get('file', ''),
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

    def _apply_diff(self, original_content: str, search_block: str, replace_block: str) -> tuple[str, bool]:
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

    def _apply_multiple_diffs(self, original_content: str, changes: List[dict]) -> tuple[str, List[dict]]:
        """Apply multiple search/replace diffs in order."""
        content = original_content
        failed = []
        
        for change in changes:
            search = change.get('search', '')
            replace = change.get('replace', '')
            
            new_content, success = self._apply_diff(content, search, replace)
            
            if success:
                content = new_content
            else:
                failed.append(change)
        
        return content, failed

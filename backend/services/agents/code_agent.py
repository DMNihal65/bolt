from .base_agent import BaseAgent

EXECUTION_PROMPT_CREATE = """You are an expert React developer. Create a new file.

TASK: {task_description}
FILE: {file_path}

DESIGN GUIDELINES:
{design_guidelines}

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

class CodeAgent(BaseAgent):
    async def create_file(self, task: dict, context_str: str, design_guidelines: dict = None) -> dict:
        """Create a new file based on task and design guidelines."""
        
        guidelines_str = ""
        if design_guidelines:
            guidelines_str = "\n".join(f"- {g}" for g in design_guidelines.get('design_guidelines', []))
        
        prompt = EXECUTION_PROMPT_CREATE.format(
            task_description=task.get('description', ''),
            file_path=task.get('file', ''),
            design_guidelines=guidelines_str,
            context=context_str
        )
        
        try:
            response_text = await self._generate_with_retry(prompt)
            result = self._parse_json(response_text)
            
            content = result.get('file_content', '')
            if not content:
                return {
                    "success": False,
                    "file": task.get('file'),
                    "error": "Model failed to generate file content",
                    "raw_response": result
                }

            return {
                "success": True,
                "file": task.get('file', ''),
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

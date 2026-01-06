from .base_agent import BaseAgent

DESIGN_PROMPT = """You are an expert UI/UX designer and React developer.
Your goal is to ensure the application looks beautiful, modern, and professional.

TASK: {task_description}
FILE: {file_path}

Review the planned task and provide design guidelines to ensure:
1. Consistent use of TailwindCSS utility classes
2. Proper spacing, typography, and color harmony
3. Use of Shadcn UI components where appropriate
4. Responsive design (mobile-first)
5. Accessibility best practices

OUTPUT FORMAT (JSON only):
{{
  "design_guidelines": [
    "Use 'p-6' for card padding",
    "Use 'text-muted-foreground' for secondary text",
    "Ensure buttons have 'hover:opacity-90' transition"
  ],
  "suggested_imports": [
    "import {{ Card, CardContent }} from '@/components/ui/card'"
  ],
  "color_palette_suggestions": "Use slate-900 for text, slate-500 for muted text"
}}
"""

class DesignAgent(BaseAgent):
    async def enhance_design(self, task: dict) -> dict:
        """Generate design guidelines for a specific task."""
        prompt = DESIGN_PROMPT.format(
            task_description=task.get('description', ''),
            file_path=task.get('file', '')
        )
        
        try:
            response_text = await self._generate_with_retry(prompt)
            return self._parse_json(response_text)
        except Exception as e:
            return {
                "design_guidelines": [],
                "suggested_imports": [],
                "error": str(e)
            }

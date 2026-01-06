from .base_agent import BaseAgent

ERROR_PROMPT = """You are an expert React developer.
An error occurred while building or running the application.

ERROR:
{error_message}

FILE: {file_path}

CURRENT FILE CONTENT:
```
{current_content}
```

Analyze the error and generate a fix.
OUTPUT FORMAT (JSON only):
{{
  "analysis": "Explanation of what caused the error",
  "fix_type": "diff",
  "changes": [
    {{
      "search": "Code causing the error",
      "replace": "Fixed code"
    }}
  ]
}}
"""

class ErrorAgent(BaseAgent):
    async def analyze_error(self, error_message: str, file_path: str, current_content: str) -> dict:
        """Analyze an error and suggest a fix."""
        
        display_content = current_content
        
        prompt = ERROR_PROMPT.format(
            error_message=error_message,
            file_path=file_path,
            current_content=display_content
        )
        
        try:
            response_text = await self._generate_with_retry(prompt)
            return self._parse_json(response_text)
        except Exception as e:
            return {
                "analysis": "Failed to analyze error",
                "fix_type": "none",
                "error": str(e)
            }

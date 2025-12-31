import google.generativeai as genai
import os
import json
import re
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are an expert AI coding assistant integrated into a browser-based IDE similar to Bolt.new.
Your job is to help users create and modify web applications that run in a WebContainer (Node.js environment in the browser).

IMPORTANT RULES:
1. You MUST respond with a structured JSON format for file operations
2. You work with React + Vite projects running in WebContainer
3. Always provide COMPLETE file contents, never partial code or snippets
4. Focus on creating beautiful, modern web applications

OUTPUT FORMAT:
You must respond with a JSON object containing:
{
  "thinking": "Brief explanation of what you're doing",
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create" | "update" | "delete",
      "content": "complete file content here"
    }
  ],
  "commands": ["npm install package-name"],
  "message": "Short message to user about what was done"
}

EXAMPLE - Creating a counter app:
{
  "thinking": "Creating a simple React counter component",
  "files": [
    {
      "path": "src/App.jsx",
      "action": "update",
      "content": "import { useState } from 'react';\\n\\nfunction App() {\\n  const [count, setCount] = useState(0);\\n  return (\\n    <div className=\\"app\\">\\n      <h1>Counter: {count}</h1>\\n      <button onClick={() => setCount(c => c + 1)}>+</button>\\n      <button onClick={() => setCount(c => c - 1)}>-</button>\\n    </div>\\n  );\\n}\\n\\nexport default App;"
    }
  ],
  "commands": [],
  "message": "Created a counter app with increment and decrement buttons"
}

CURRENT PROJECT CONTEXT:
The WebContainer runs a Vite + React project. The typical file structure is:
- package.json (dependencies)
- vite.config.js (Vite configuration)
- index.html (entry HTML)
- src/main.jsx (React entry point)
- src/App.jsx (main App component)
- src/index.css (global styles)

Always output valid JSON only. Never include markdown code blocks or explanations outside JSON."""

class GeminiService:
    def __init__(self):
        api_key = "AIzaSyCcDlUbAltl6R9qRlsiy6trunH5gBA9c5g"
        
        genai.configure(api_key=api_key)
        
        # Try different model names
        try:
            self.model = genai.GenerativeModel('gemini-2.5-flash')
        except Exception:
            try:
                self.model = genai.GenerativeModel('gemini-pro')
            except Exception:
                self.model = genai.GenerativeModel('models/gemini-pro')

    def parse_response(self, text: str) -> dict:
        """Parse AI response to extract JSON"""
        # Clean the text - remove markdown code blocks
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
            # Try to extract JSON from the text
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    pass
        
        # Return fallback format if parsing fails
        return {
            "thinking": "Failed to parse structured response",
            "files": [],
            "commands": [],
            "message": f"AI returned: {text[:300]}..."
        }

    async def generate_code(self, messages: list, current_files: dict = None) -> dict:
        """Generate code changes based on user request"""
        # Build context with current files
        context = ""
        if current_files:
            context = "\n\nCURRENT FILES IN PROJECT:\n"
            for path, content in current_files.items():
                if isinstance(content, dict):
                    content = content.get('content', str(content))
                context += f"\n--- {path} ---\n{str(content)[:1000]}\n"
        
        # Build the full prompt with system instruction
        user_request = messages[-1]['content'] if messages else "Hello"
        full_prompt = f"""{SYSTEM_PROMPT}

---

User request: {user_request}
{context}

Remember: Respond ONLY with valid JSON, no markdown formatting."""
        
        try:
            response = self.model.generate_content(full_prompt)
            return self.parse_response(response.text)
        except Exception as e:
            return {
                "thinking": "API error",
                "files": [],
                "commands": [],
                "message": f"Error calling Gemini API: {str(e)}"
            }

    async def stream_structured(self, messages: list, current_files: dict = None) -> AsyncGenerator[str, None]:
        """Stream the response and yield structured updates"""
        try:
            result = await self.generate_code(messages, current_files)
            yield json.dumps(result)
        except Exception as e:
            yield json.dumps({
                "thinking": "Error occurred",
                "files": [],
                "commands": [],
                "message": f"Error: {str(e)}"
            })

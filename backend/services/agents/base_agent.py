import google.generativeai as genai
import json
import re
from typing import Dict, Any, Optional
from services.rate_limiter import get_rate_limiter

class BaseAgent:
    def __init__(self, model_name: str = 'gemini-2.5-flash'):
        self.rate_limiter = get_rate_limiter()
        self.model_name = model_name
        self.model = None
        self._configure_model()

    def _configure_model(self):
        """Configure the model with the current API key"""
        api_key = self.rate_limiter.get_current_key()
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(self.model_name)

    def _parse_json(self, text: str) -> dict:
        """Extract and parse JSON from response"""
        text = text.strip()
        
        # Remove markdown code blocks
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0]
        elif '```' in text:
            text = text.split('```')[1].split('```')[0]
            
        text = text.strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to find JSON object with regex
            # Match from first { to last }
            match = re.search(r'(\{.*\})', text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(1))
                except:
                    pass
            return {"error": "Failed to parse JSON", "raw": text[:500]}

    async def _generate_with_retry(self, prompt: str) -> str:
        """Generate content with automatic retry and rate limit handling"""
        
        async def _do_generate():
            self._configure_model()
            
            # DEBUG LOGGING
            print("\n" + "="*50)
            print(f"🤖 SENDING PROMPT TO {self.model_name}:")
            print("-" * 20)
            print(prompt)
            print("-" * 20)
            print("="*50 + "\n")
            
            response = self.model.generate_content(prompt)
            
            text_response = ""
            # Handle multi-part responses
            if response.parts:
                text_response = "".join([part.text for part in response.parts])
            else:
                text_response = response.text
                
            # DEBUG LOGGING
            print("\n" + "="*50)
            print(f"✅ RECEIVED RESPONSE FROM {self.model_name}:")
            print("-" * 20)
            print(text_response)
            print("-" * 20)
            print("="*50 + "\n")
            
            return text_response
        
        return await self.rate_limiter.execute_with_retry(_do_generate)

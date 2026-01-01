"""
Rate Limiter Service for Gemini API
Provides exponential backoff, retry logic, and multi-key rotation
"""

import os
import time
import asyncio
import re
from typing import Optional, Callable, Any
from dataclasses import dataclass, field
from collections import deque


@dataclass
class APIKeyConfig:
    """Configuration for a single API key"""
    key: str
    requests_made: int = 0
    last_request_time: float = 0
    is_rate_limited: bool = False
    rate_limit_reset_time: float = 0


class RateLimiter:
    """
    Rate limiting service with:
    - Exponential backoff on 429 errors
    - Multiple API key rotation
    - Automatic retry logic
    """
    
    def __init__(self):
        self.api_keys: list[APIKeyConfig] = []
        self.current_key_index = 0
        self.max_retries = 3
        self.base_delay = 1.0  # Base delay in seconds
        self.max_delay = 60.0  # Maximum delay
        
        self._load_api_keys()
    
    def _load_api_keys(self):
        """Load API keys from environment variables"""
        # Primary key
        primary_key = os.getenv("GEMINI_API_KEY")
        if primary_key:
            self.api_keys.append(APIKeyConfig(key=primary_key))
        
        # Additional keys (GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc.)
        for i in range(2, 10):
            key = os.getenv(f"GEMINI_API_KEY_{i}")
            if key:
                self.api_keys.append(APIKeyConfig(key=key))
        
        # Fallback to hardcoded key if no env vars (for development only)
        if not self.api_keys:
            fallback_key = "AIzaSyBO7sonL9NXkyYtYnCvPaPc-JrOC2crNCc"
            self.api_keys.append(APIKeyConfig(key=fallback_key))
            print("⚠️  Warning: Using fallback API key. Set GEMINI_API_KEY in .env")
        
        print(f"✓ Loaded {len(self.api_keys)} API key(s)")
    
    def get_current_key(self) -> str:
        """Get the current active API key"""
        if not self.api_keys:
            raise ValueError("No API keys available")
        
        # Find an available key (not rate-limited)
        for _ in range(len(self.api_keys)):
            key_config = self.api_keys[self.current_key_index]
            
            # Check if rate limit has expired
            if key_config.is_rate_limited:
                if time.time() >= key_config.rate_limit_reset_time:
                    key_config.is_rate_limited = False
                    print(f"✓ API key {self.current_key_index + 1} rate limit expired, now available")
                else:
                    # Try next key
                    self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
                    continue
            
            return key_config.key
        
        # All keys are rate-limited, return the one with soonest reset
        soonest_reset = min(self.api_keys, key=lambda k: k.rate_limit_reset_time)
        self.current_key_index = self.api_keys.index(soonest_reset)
        return soonest_reset.key
    
    def mark_rate_limited(self, retry_after_seconds: float = 60.0):
        """Mark the current key as rate-limited"""
        key_config = self.api_keys[self.current_key_index]
        key_config.is_rate_limited = True
        key_config.rate_limit_reset_time = time.time() + retry_after_seconds
        print(f"⚠️  API key {self.current_key_index + 1} rate-limited. Reset in {retry_after_seconds:.1f}s")
        
        # Try to rotate to next key
        self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
    
    def parse_retry_delay(self, error_message: str) -> float:
        """Extract retry delay from error message"""
        # Look for patterns like "retry in 54.634013995s" or "retry_delay { seconds: 54 }"
        patterns = [
            r'retry in ([\d.]+)s',
            r'retry_delay.*?seconds:\s*([\d.]+)',
            r'Please retry in ([\d.]+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, error_message, re.IGNORECASE)
            if match:
                return float(match.group(1))
        
        return 60.0  # Default to 60 seconds
    
    def calculate_backoff(self, attempt: int) -> float:
        """Calculate exponential backoff delay"""
        delay = self.base_delay * (2 ** attempt)
        return min(delay, self.max_delay)
    
    async def execute_with_retry(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """
        Execute a function with automatic retry and rate limit handling.
        
        Args:
            func: The async function to execute
            *args, **kwargs: Arguments to pass to the function
        
        Returns:
            The result of the function
        
        Raises:
            Exception: If all retries are exhausted
        """
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                # Execute the function
                result = await func(*args, **kwargs)
                return result
                
            except Exception as e:
                error_str = str(e)
                last_error = e
                
                # Check if it's a rate limit error (429)
                if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower():
                    # Parse retry delay from error
                    retry_delay = self.parse_retry_delay(error_str)
                    
                    # Mark current key as rate-limited
                    self.mark_rate_limited(retry_delay)
                    
                    # Check if we have other available keys
                    available_keys = [k for k in self.api_keys if not k.is_rate_limited]
                    
                    if available_keys:
                        print(f"↻ Rotating to next available API key...")
                        continue  # Immediately try with new key
                    else:
                        # All keys exhausted, wait for the shortest reset time
                        min_wait = min(
                            k.rate_limit_reset_time - time.time() 
                            for k in self.api_keys
                        )
                        min_wait = max(1.0, min_wait)  # At least 1 second
                        
                        print(f"⏳ All API keys rate-limited. Waiting {min_wait:.1f}s...")
                        await asyncio.sleep(min_wait)
                        
                        # Reset the rate limit status for the key with expired limit
                        for k in self.api_keys:
                            if time.time() >= k.rate_limit_reset_time:
                                k.is_rate_limited = False
                        
                        continue
                else:
                    # Non-rate-limit error, use exponential backoff
                    backoff = self.calculate_backoff(attempt)
                    print(f"⚠️  Error (attempt {attempt + 1}/{self.max_retries}): {error_str[:100]}")
                    print(f"↻ Retrying in {backoff:.1f}s...")
                    await asyncio.sleep(backoff)
        
        # All retries exhausted
        raise last_error or Exception("All retries exhausted")
    
    def get_status(self) -> dict:
        """Get current rate limiter status"""
        return {
            "total_keys": len(self.api_keys),
            "current_key_index": self.current_key_index,
            "keys_status": [
                {
                    "index": i,
                    "is_rate_limited": k.is_rate_limited,
                    "reset_in": max(0, k.rate_limit_reset_time - time.time()) if k.is_rate_limited else 0
                }
                for i, k in enumerate(self.api_keys)
            ]
        }


# Singleton instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Get the singleton rate limiter instance"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter

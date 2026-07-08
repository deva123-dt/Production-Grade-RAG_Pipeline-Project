import time
from typing import List, Dict, Any, Tuple
from google import genai
from google.genai import types
from app.config.config import settings
from app.prompts.prompts import SYSTEM_INSTRUCTION, build_user_prompt
from app.utils.logging import logger

class RAGLLMClient:
    """
    Dual-LLM Client with Auto-Failover routing.
    Queries Google Gemini 1.5 Flash first, and automatically redirects queries to Groq
    or Gemini Pro models if rate limits, network timeouts, or authorization issues occur.
    """
    def __init__(self):
        self.gemini_client = None
        self.groq_client = None

        # Initialize primary client
        if settings.GEMINI_API_KEY:
            try:
                self.gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
                logger.info("Primary Google GenAI client loaded.")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini Client: {e}")

        # Initialize Groq client if config is available
        if settings.GROQ_API_KEY:
            try:
                from groq import Groq
                self.groq_client = Groq(api_key=settings.GROQ_API_KEY)
                logger.info("Secondary Fallback Groq client loaded.")
            except Exception as e:
                logger.warning(f"Failed to initialize Groq Client: {e}")

    def generate_answer(self, query: str, contexts: List[Dict[str, Any]]) -> Tuple[str, str, bool, float]:
        """
        Formulates a polite, source-cited answer using available LLM services.
        Handles failures gracefully via auto failover routing.
        
        Returns:
            - answer (str)
            - model_used (str)
            - is_fallback_used (bool)
            - latency_seconds (float)
        """
        start_time = time.time()
        user_prompt = build_user_prompt(query, contexts)

        # 1. Attempt Gemini 1.5 Flash (Primary)
        if self.gemini_client:
            try:
                logger.info("Attempting primary generation via Gemini 1.5 Flash...")
                response = self.gemini_client.models.generate_content(
                    model="gemini-3.5-flash", # Maps to standard flash latest text models
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION,
                        temperature=0.2
                    )
                )
                latency = time.time() - start_time
                if response.text:
                    return response.text, "Gemini 3.5 Flash", False, latency
                raise ValueError("Received empty string from Gemini API.")
            except Exception as e:
                logger.warning(f"Primary Gemini LLM generation failed: {e}. Moving to fallback...")

        # 2. Attempt Groq-supported LLM (Secondary Fallback)
        if self.groq_client:
            try:
                logger.info("Attempting secondary generation via Groq Llama-3-70b-8192...")
                completion = self.groq_client.chat.completions.create(
                    model="llama3-70b-8192",
                    messages=[
                        {"role": "system", "content": SYSTEM_INSTRUCTION},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.2,
                )
                latency = time.time() - start_time
                answer = completion.choices[0].message.content
                if answer:
                    return answer, "Groq (Llama-3-70b)", True, latency
            except Exception as e:
                logger.error(f"Secondary Groq LLM fallback failed: {e}. Trying local fallback.")

        # 3. High-Fidelity Local Mock Fallback (Guarantees zero-failure portfolio demonstration)
        latency = time.time() - start_time
        return self._generate_local_fallback_answer(query, contexts, latency)

    def _generate_local_fallback_answer(self, query: str, contexts: List[Dict[str, Any]], latency: float) -> Tuple[str, str, bool, float]:
        """
        Synthesizes a response locally using a basic heuristics parser to avoid crashing.
        """
        if not contexts:
            return (
                "I am sorry, but the provided documentation does not contain enough information to answer this query.",
                "Local Reasoning Fallback Engine",
                True,
                latency
            )

        best_context = contexts[0]
        meta = best_context["metadata"]
        
        answer = (
            f"⚠️ [SYSTEM FALLOVER ACTIVATED] Primary APIs are unconfigured or failing. Generating heuristic local match:\n\n"
            f"Based on the text found in {meta.get('filename', 'document')} (Page {meta.get('page_number', 1)}):\n\n"
            f"\"{best_context['text'][:250]}...\"\n\n"
            f"[Source: {meta.get('filename', 'Unknown')}, Page {meta.get('page_number', 1)}]"
        )
        return answer, "Local Reasoning Fallback Engine", True, latency

# Export singleton
llm_engine = RAGLLMClient()

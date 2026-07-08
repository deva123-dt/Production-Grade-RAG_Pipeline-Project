import os
from pathlib import Path
from dotenv import load_dotenv

# Locate and load the root env configuration
ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

class Settings:
    """
    RAG Pipeline Configuration Settings
    """
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    
    # Path mappings
    DATA_DIR: Path = ROOT_DIR / "data"
    CHROMA_DB_DIR: Path = ROOT_DIR / "chroma_db"
    
    # RAG parameters
    DEFAULT_TOP_K: int = 4
    SEMANTIC_PERCENTILE_THRESHOLD: int = 80
    
    def validate(self):
        """
        Validates vital keys are present before production deployment
        """
        if not self.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY environment variable is required.")

settings = Settings()
# Ensure directories exist
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.CHROMA_DB_DIR.mkdir(parents=True, exist_ok=True)

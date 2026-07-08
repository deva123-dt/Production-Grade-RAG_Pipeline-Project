import logging
import sys
from pathlib import Path

# Create logs directory if it doesn't exist
LOGS_DIR = Path(__file__).resolve().parents[2] / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOGS_DIR / "rag_pipeline.log"

def setup_logger() -> logging.Logger:
    """
    Configures and returns a professional logger that streams to console
    and persists detailed debug logs to disk.
    """
    logger = logging.getLogger("RAGPipeline")
    logger.setLevel(logging.INFO)

    # Avoid duplicate handlers if already configured
    if logger.handlers:
        return logger

    # Format definitions
    log_format = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s:%(filename)s:%(lineno)d] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # Console stream handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_format)
    console_handler.setLevel(logging.INFO)
    logger.addHandler(console_handler)

    # Disk file handler
    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(log_format)
    file_handler.setLevel(logging.DEBUG)
    logger.addHandler(file_handler)

    return logger

logger = setup_logger()

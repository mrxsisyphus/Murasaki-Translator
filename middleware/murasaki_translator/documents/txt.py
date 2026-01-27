"""TXT Document Handler - Supports plain text files."""

from typing import List, Dict, Any
from .base import BaseDocument
from murasaki_translator.core.chunker import TextBlock

class TxtDocument(BaseDocument):
    def load(self) -> List[Dict[str, Any]]:
        with open(self.path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # Plain text metadata is just the line index
        return [{'text': line, 'meta': idx} for idx, line in enumerate(lines)]

    def save(self, output_path: str, blocks: List[TextBlock]):
        with open(output_path, 'w', encoding='utf-8') as f:
            for block in blocks:
                if block.prompt_text:
                    f.write(block.prompt_text + "\n")
                    # Note: Chunker rubber band usually includes \n, but we add one for block separation if needed.
                    # Actually, process_rubber_band preserves ends.
                    # We'll follow main.py's existing logic.

"""SRT Document Handler - Supports subtitle files while preserving timecodes."""

import re
from typing import List, Dict, Any, Optional
from .base import BaseDocument
from murasaki_translator.core.chunker import TextBlock

class SrtDocument(BaseDocument):
    def load(self) -> List[Dict[str, Any]]:
        with open(self.path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Regex to match SRT blocks: Index, Time, Text
        blocks = re.split(r'\n\s*\n', content.strip())
        items = []
        
        for block in blocks:
            lines = block.splitlines()
            if len(lines) >= 3:
                idx = lines[0]
                time = lines[1]
                text = "\n".join(lines[2:])
                # Metadata is the index and timecode
                items.append({'text': text + "\n", 'meta': {'idx': idx, 'time': time}})
            else:
                # Fallback for weird blocks
                items.append({'text': block + "\n", 'meta': None})
                
        return items

    def save(self, output_path: str, blocks: List[TextBlock]):
        with open(output_path, 'w', encoding='utf-8') as f:
            for block in blocks:
                # Reconstruct SRT from translated text and metadata
                # Assuming 1:1 mapping if using line mode or carefully tracked metadata
                texts = block.prompt_text.splitlines()
                metas = block.metadata
                
                # If rubber band merges blocks, we might have multiple metas in one block.
                # The Chunker refactor I did stores metadata as a list in TextBlock.
                
                # For SRT, we usually want line mode to keep 1:1, but rubber band works if 
                # we assume each 'item' (node/subtitle) is a 'line' in the prompt.
                
                # Simple reconstruction: zip metas and texts
                # This works if LineAligner or the model preserves line count exactly.
                for m, t in zip(metas, texts):
                    if m:
                        f.write(f"{m['idx']}\n")
                        f.write(f"{m['time']}\n")
                        f.write(f"{t}\n\n")
                    else:
                        f.write(f"{t}\n\n")

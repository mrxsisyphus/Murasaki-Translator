"""Base Document Class - Defines the interface for different document formats."""

from typing import List, Dict, Any, Union
from abc import ABC, abstractmethod
from murasaki_translator.core.chunker import TextBlock

class BaseDocument(ABC):
    def __init__(self, path: str):
        self.path = path
        self.raw_lines = []
        self.metadata = {}

    @abstractmethod
    def load(self) -> List[Dict[str, Any]]:
        """
        Load document and return a list of items for the chunker.
        Each item: {'text': str, 'meta': Any}
        """
        pass

    @abstractmethod
    def save(self, output_path: str, blocks: List[TextBlock]):
        """
        Reconstruct and save the document with translated text.
        """
        pass

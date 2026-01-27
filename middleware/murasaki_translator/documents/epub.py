"""EPUB Document Handler - Extracts and re-injects text while preserving HTML structure."""

import os
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
from typing import List, Dict, Any, Optional
from .base import BaseDocument
from murasaki_translator.core.chunker import TextBlock

class EpubDocument(BaseDocument):
    def __init__(self, path: str):
        super().__init__(path)
        self.book = None
        self.items_to_process = [] # List of (item_name, soup, nodes)

    def load(self) -> List[Dict[str, Any]]:
        self.book = epub.read_epub(self.path)
        items = []
        
        for item in self.book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                soup = BeautifulSoup(item.get_content(), 'html.parser')
                
                # 1. Remove Ruby text (Furigana) - Optional? 
                # Usually desired for translation input
                for ruby in soup.find_all('ruby'):
                    for tag in ruby.find_all(['rt', 'rp']):
                        tag.decompose()

                # 2. Extract translatable blocks
                nodes = soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
                
                if nodes:
                    item_nodes = []
                    for i, node in enumerate(nodes):
                        text = node.get_text(strip=True)
                        if text:
                            # Store node reference in metadata
                            meta = {'item_name': item.get_name(), 'node_idx': i}
                            items.append({'text': text + "\n", 'meta': meta})
                            item_nodes.append(node)
                    
                    self.items_to_process.append({
                        'item_name': item.get_name(),
                        'soup': soup,
                        'nodes': item_nodes
                    })
        
        return items

    def save(self, output_path: str, blocks: List[TextBlock]):
        # Re-inject translated text into our cached soup objects
        # We need a flat list of translated nodes from the blocks
        translated_texts = []
        for block in blocks:
            # Each block.prompt_text contains multiple lines if rubber band was used
            translated_texts.extend(block.prompt_text.splitlines())
            
        # Match translated texts to nodes
        text_idx = 0
        for item_info in self.items_to_process:
            soup = item_info['soup']
            nodes = item_info['nodes']
            
            for node in nodes:
                if text_idx < len(translated_texts):
                    node.string = translated_texts[text_idx]
                    text_idx += 1
            
            # Update item content in book
            item = self.book.get_item_with_name(item_info['item_name'])
            item.set_content(str(soup).encode('utf-8'))
            
        # Write EPUB
        epub.write_epub(output_path, self.book)

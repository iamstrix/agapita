import logging
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel
from typing import Dict, List
import time
import asyncio

logger = logging.getLogger("AgapitaServer")

class EmbeddingEngine:
    def __init__(self, model_id="sentence-transformers/all-MiniLM-L6-v2"):
        logger.info(f"[VectorStore] Loading embedding model {model_id}...")
        start = time.perf_counter()
        
        # Run tiny model on CPU (90MB footprint, ~5ms latency).
        # This keeps the MPS GPU completely free for SigLIP2.
        self.device = torch.device("cpu")
        
        self.tokenizer = AutoTokenizer.from_pretrained(model_id)
        self.model = AutoModel.from_pretrained(model_id).to(self.device).eval()
        
        elapsed = time.perf_counter() - start
        logger.info(f"[VectorStore] Embedding model loaded in {elapsed:.2f}s")
        
    def embed(self, texts: List[str]) -> torch.Tensor:
        """Compute mean-pooled, L2-normalized embeddings for a list of texts."""
        if not texts:
            return torch.empty((0, self.model.config.hidden_size), device=self.device)
            
        inputs = self.tokenizer(texts, padding=True, truncation=True, return_tensors="pt").to(self.device)
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            
        # Mean pooling
        attention_mask = inputs['attention_mask']
        token_embeddings = outputs.last_hidden_state
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        pooled = torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        
        # L2 Normalize
        return F.normalize(pooled, p=2, dim=1)


class VectorRecordStore:
    def __init__(self, engine: EmbeddingEngine):
        self.engine = engine
        self.records: Dict[str, List[str]] = {}
        self.embeddings: Dict[str, torch.Tensor] = {}
        
    def clear(self):
        self.records = {}
        self.embeddings = {}
        
    def get_all(self, patient_id: str) -> List[str]:
        return self.records.get(patient_id, [])
        
    async def add_record(self, patient_id: str, text: str):
        vec = await asyncio.to_thread(self.engine.embed, [text])
        
        if patient_id not in self.records:
            self.records[patient_id] = []
            self.embeddings[patient_id] = torch.empty((0, vec.shape[1]), device=vec.device)
            
        self.records[patient_id].append(text)
        self.embeddings[patient_id] = torch.cat([self.embeddings[patient_id], vec], dim=0)
        
    def search(self, patient_id: str, query: str, top_k: int = 2) -> List[str]:
        """Semantically search the patient's records for the query."""
        if patient_id not in self.records or len(self.records[patient_id]) == 0:
            return []
            
        start = time.perf_counter()
        
        # Embed query
        query_vec = self.engine.embed([query]) # [1, D]
        
        # Compute cosine similarity
        patient_embs = self.embeddings[patient_id] # [N, D]
        similarities = torch.matmul(query_vec, patient_embs.T).squeeze(0) # [N]
        
        k = min(top_k, len(self.records[patient_id]))
        top_scores, top_indices = similarities.topk(k)
        
        results = []
        for score, idx in zip(top_scores, top_indices):
            # Only include results with a positive cosine similarity
            if score.item() > 0.05:
                results.append(self.records[patient_id][idx.item()])
                
        elapsed = time.perf_counter() - start
        logger.info(f"[VectorStore] Found {len(results)} matches for '{query}' in {elapsed:.4f}s")
            
        return results

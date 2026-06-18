import logging
from pathlib import Path
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel
from typing import Iterable, List, Tuple
import time
import asyncio
import lancedb
import pyarrow as pa

logger = logging.getLogger("AgapitaServer")

EMBEDDING_DIM = 384
TABLE_NAME = "patient_records"
DRAWING_MEANINGS_TABLE_NAME = "drawing_meanings"
MIN_COSINE_SIMILARITY = 0.05

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
    def __init__(self, engine: EmbeddingEngine, db_path: str | Path | None = None):
        self.engine = engine
        self.db_path = Path(db_path) if db_path else Path(__file__).resolve().parent / "lancedb_data"
        self.db = lancedb.connect(str(self.db_path))
        self.table = self._open_or_create_table()

    def _schema(self) -> pa.Schema:
        return pa.schema(
            [
                pa.field("record_id", pa.int64()),
                pa.field("patient_id", pa.string()),
                pa.field("text", pa.string()),
                pa.field("vector", pa.list_(pa.float32(), EMBEDDING_DIM)),
            ]
        )

    def _open_or_create_table(self):
        try:
            return self.db.open_table(TABLE_NAME)
        except Exception:
            return self.db.create_table(TABLE_NAME, schema=self._schema(), exist_ok=True)

    def _recreate_table(self):
        if TABLE_NAME in self.db.list_tables():
            self.db.drop_table(TABLE_NAME)
        self.table = self.db.create_table(TABLE_NAME, schema=self._schema(), mode="overwrite")

    def _rows(self) -> List[dict]:
        if self.table.count_rows() == 0:
            return []
        return self.table.to_arrow().to_pylist()

    def _quote(self, value: str) -> str:
        return value.replace("'", "''")

    def _record_filter(self, record_id: int) -> str:
        return f"record_id = {int(record_id)}"

    def _patient_filter(self, patient_id: str) -> str:
        return f"patient_id = '{self._quote(patient_id)}'"

    def _embed_one(self, text: str) -> List[float]:
        if not self.engine:
            raise RuntimeError("VectorRecordStore requires an embedding engine before embedding records.")
        vec = self.engine.embed([text])
        if isinstance(vec, torch.Tensor):
            values = vec.detach().cpu().to(torch.float32).squeeze(0).tolist()
        else:
            values = vec[0]
        if len(values) != EMBEDDING_DIM:
            raise ValueError(f"Expected {EMBEDDING_DIM}-dimensional embedding, got {len(values)}.")
        return [float(value) for value in values]
        
    def clear(self):
        self._recreate_table()
        
    def get_all(self, patient_id: str) -> List[str]:
        rows = [
            row for row in self._rows()
            if row["patient_id"] == patient_id
        ]
        return [row["text"] for row in sorted(rows, key=lambda row: row["record_id"])]

    def get_indexed_record_ids(self) -> set[int]:
        return {int(row["record_id"]) for row in self._rows()}

    def delete_missing_records(self, valid_record_ids: Iterable[int]):
        valid = {int(record_id) for record_id in valid_record_ids}
        for row in self._rows():
            record_id = int(row["record_id"])
            if record_id not in valid:
                self.table.delete(self._record_filter(record_id))

    def add_record_sync(self, record_id: int, patient_id: str, text: str):
        vector = self._embed_one(text)
        self.table.delete(self._record_filter(record_id))
        self.table.add(
            [
                {
                    "record_id": int(record_id),
                    "patient_id": patient_id,
                    "text": text,
                    "vector": vector,
                }
            ]
        )
        
    async def add_record(self, record_id: int, patient_id: str, text: str):
        await asyncio.to_thread(self.add_record_sync, record_id, patient_id, text)

    def sync_records(self, records: Iterable[Tuple[int, str, str]]):
        desired = {
            int(record_id): (patient_id, text)
            for record_id, patient_id, text in records
        }
        existing = {
            int(row["record_id"]): (row["patient_id"], row["text"])
            for row in self._rows()
        }

        for record_id in set(existing) - set(desired):
            self.table.delete(self._record_filter(record_id))

        for record_id, (patient_id, text) in desired.items():
            if existing.get(record_id) != (patient_id, text):
                self.add_record_sync(record_id, patient_id, text)
        
    def search(self, patient_id: str, query: str, top_k: int = 2) -> List[str]:
        """Semantically search the patient's records for the query."""
        if self.table.count_rows(self._patient_filter(patient_id)) == 0:
            return []
            
        start = time.perf_counter()
        
        # Embed query
        query_vec = self._embed_one(query)
        distance_threshold = 1.0 - MIN_COSINE_SIMILARITY
        matches = (
            self.table.search(query_vec)
            .distance_type("cosine")
            .where(self._patient_filter(patient_id))
            .limit(top_k)
            .to_list()
        )
        results = [
            row["text"]
            for row in matches
            if float(row.get("_distance", 1.0)) < distance_threshold
        ]
                
        elapsed = time.perf_counter() - start
        logger.info(f"[VectorStore] Found {len(results)} matches for '{query}' in {elapsed:.4f}s")
            
        return results


class VectorDrawingMeaningStore:
    def __init__(self, engine: EmbeddingEngine, db_path: str | Path | None = None):
        self.engine = engine
        self.db_path = Path(db_path) if db_path else Path(__file__).resolve().parent / "lancedb_data"
        self.db = lancedb.connect(str(self.db_path))
        self.table = self._open_or_create_table()

    def _schema(self) -> pa.Schema:
        return pa.schema(
            [
                pa.field("meaning_id", pa.string()),
                pa.field("label", pa.string()),
                pa.field("aliases", pa.string()),
                pa.field("category", pa.string()),
                pa.field("intent_template", pa.string()),
                pa.field("context", pa.string()),
                pa.field("search_text", pa.string()),
                pa.field("vector", pa.list_(pa.float32(), EMBEDDING_DIM)),
            ]
        )

    def _open_or_create_table(self):
        try:
            return self.db.open_table(DRAWING_MEANINGS_TABLE_NAME)
        except Exception:
            return self.db.create_table(DRAWING_MEANINGS_TABLE_NAME, schema=self._schema(), exist_ok=True)

    def _recreate_table(self):
        if DRAWING_MEANINGS_TABLE_NAME in self.db.list_tables():
            self.db.drop_table(DRAWING_MEANINGS_TABLE_NAME)
        self.table = self.db.create_table(DRAWING_MEANINGS_TABLE_NAME, schema=self._schema(), mode="overwrite")

    def _rows(self) -> List[dict]:
        if self.table.count_rows() == 0:
            return []
        return self.table.to_arrow().to_pylist()

    def _quote(self, value: str) -> str:
        return value.replace("'", "''")

    def _meaning_filter(self, meaning_id: str) -> str:
        return f"meaning_id = '{self._quote(meaning_id)}'"

    def _embed_one(self, text: str) -> List[float]:
        if not self.engine:
            raise RuntimeError("VectorDrawingMeaningStore requires an embedding engine before embedding meanings.")
        vec = self.engine.embed([text])
        if isinstance(vec, torch.Tensor):
            values = vec.detach().cpu().to(torch.float32).squeeze(0).tolist()
        else:
            values = vec[0]
        if len(values) != EMBEDDING_DIM:
            raise ValueError(f"Expected {EMBEDDING_DIM}-dimensional embedding, got {len(values)}.")
        return [float(value) for value in values]

    def _normalize_aliases(self, aliases) -> str:
        if isinstance(aliases, str):
            return aliases
        if aliases is None:
            return ""
        return ", ".join(str(alias).strip() for alias in aliases if str(alias).strip())

    def _search_text(self, meaning: dict, aliases: str) -> str:
        return " ".join(
            value
            for value in [
                meaning.get("label", ""),
                aliases,
                meaning.get("category", ""),
                meaning.get("intent_template", ""),
                meaning.get("context", ""),
            ]
            if value
        )

    def _format_row(self, row: dict) -> str:
        return (
            f"Drawing meaning: {row['label']}. "
            f"{row['intent_template']} "
            f"Context: {row['context']}"
        )

    def clear(self):
        self._recreate_table()

    def get_all_meaning_ids(self) -> set[str]:
        return {str(row["meaning_id"]) for row in self._rows()}

    def sync_meanings(self, meanings: Iterable[dict]):
        desired = {}
        for meaning in meanings:
            meaning_id = str(meaning["meaning_id"])
            aliases = self._normalize_aliases(meaning.get("aliases", ""))
            desired[meaning_id] = {
                "meaning_id": meaning_id,
                "label": str(meaning["label"]),
                "aliases": aliases,
                "category": str(meaning["category"]),
                "intent_template": str(meaning["intent_template"]),
                "context": str(meaning["context"]),
            }

        existing = {
            str(row["meaning_id"]): {
                "meaning_id": str(row["meaning_id"]),
                "label": row["label"],
                "aliases": row["aliases"],
                "category": row["category"],
                "intent_template": row["intent_template"],
                "context": row["context"],
            }
            for row in self._rows()
        }

        for meaning_id in set(existing) - set(desired):
            self.table.delete(self._meaning_filter(meaning_id))

        for meaning_id, meaning in desired.items():
            if existing.get(meaning_id) == meaning:
                continue

            search_text = self._search_text(meaning, meaning["aliases"])
            row = {
                **meaning,
                "search_text": search_text,
                "vector": self._embed_one(search_text),
            }
            self.table.delete(self._meaning_filter(meaning_id))
            self.table.add([row])

    def search_meanings(self, query: str, top_k: int = 3) -> List[str]:
        if self.table.count_rows() == 0:
            return []

        query_vec = self._embed_one(query)
        distance_threshold = 1.0 - MIN_COSINE_SIMILARITY
        matches = (
            self.table.search(query_vec)
            .distance_type("cosine")
            .limit(top_k)
            .to_list()
        )
        return [
            self._format_row(row)
            for row in matches
            if float(row.get("_distance", 1.0)) < distance_threshold
        ]

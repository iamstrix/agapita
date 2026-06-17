from pathlib import Path
import sys

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vector_store import VectorRecordStore


class FakeEmbeddingEngine:
    def embed(self, texts):
        vectors = []
        for text in texts:
            lowered = text.lower()
            vector = torch.zeros(384, dtype=torch.float32)
            if "music" in lowered or "jazz" in lowered:
                vector[0] = 1.0
            elif "toast" in lowered or "breakfast" in lowered:
                vector[1] = 1.0
            elif "medicine" in lowered or "lisinopril" in lowered:
                vector[2] = 1.0
            else:
                vector[3] = 1.0
            vectors.append(vector)
        return torch.stack(vectors)


def test_add_record_persists_and_get_all_reads_patient_records(tmp_path):
    db_path = tmp_path / "lancedb_data"
    store = VectorRecordStore(engine=FakeEmbeddingEngine(), db_path=db_path)

    store.add_record_sync(1, "PatientA", "Former jazz musician")
    reopened = VectorRecordStore(engine=FakeEmbeddingEngine(), db_path=db_path)

    assert reopened.get_all("PatientA") == ["Former jazz musician"]


def test_search_returns_only_matching_patient_records(tmp_path):
    store = VectorRecordStore(engine=FakeEmbeddingEngine(), db_path=tmp_path / "lancedb_data")
    store.add_record_sync(1, "PatientA", "Former jazz musician")
    store.add_record_sync(2, "PatientB", "Former jazz musician")
    store.add_record_sync(3, "PatientA", "Prefers rye toast")

    results = store.search("PatientA", "music", top_k=3)

    assert results == ["Former jazz musician"]


def test_search_applies_similarity_threshold(tmp_path):
    store = VectorRecordStore(engine=FakeEmbeddingEngine(), db_path=tmp_path / "lancedb_data")
    store.add_record_sync(1, "PatientA", "Prefers rye toast")

    assert store.search("PatientA", "music", top_k=3) == []


def test_sync_records_skips_unchanged_rows_and_removes_stale_rows(tmp_path):
    engine = FakeEmbeddingEngine()
    store = VectorRecordStore(engine=engine, db_path=tmp_path / "lancedb_data")
    store.sync_records(
        [
            (1, "PatientA", "Former jazz musician"),
            (2, "PatientA", "Prefers rye toast"),
        ]
    )

    store.sync_records([(1, "PatientA", "Former jazz musician")])

    assert store.get_indexed_record_ids() == {1}
    assert store.get_all("PatientA") == ["Former jazz musician"]


def test_sync_records_refreshes_edited_or_reassigned_rows(tmp_path):
    store = VectorRecordStore(engine=FakeEmbeddingEngine(), db_path=tmp_path / "lancedb_data")
    store.sync_records([(1, "PatientA", "Former jazz musician")])

    store.sync_records([(1, "PatientB", "Needs Lisinopril medicine")])

    assert store.get_all("PatientA") == []
    assert store.get_all("PatientB") == ["Needs Lisinopril medicine"]
    assert store.search("PatientB", "medicine", top_k=3) == ["Needs Lisinopril medicine"]

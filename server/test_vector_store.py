from pathlib import Path
import sys

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vector_store import (
    VectorDrawingMeaningStore,
    VectorLearnedDrawingMeaningStore,
    VectorRecordStore,
)


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


def test_drawing_meanings_persist_and_search_by_alias(tmp_path):
    db_path = tmp_path / "lancedb_data"
    store = VectorDrawingMeaningStore(engine=FakeEmbeddingEngine(), db_path=db_path)
    store.sync_meanings(
        [
            {
                "meaning_id": "water",
                "label": "water",
                "aliases": ["cup", "glass", "drink"],
                "category": "basic_needs",
                "intent_template": "I'm thirsty, can I have water?",
                "context": "A drawing of a cup, glass, bottle, or water usually means the patient wants a drink.",
            },
            {
                "meaning_id": "music",
                "label": "music",
                "aliases": ["jazz", "song", "musical notes"],
                "category": "comfort",
                "intent_template": "Can I listen to music?",
                "context": "A drawing of musical notes usually means the patient wants music or familiar songs.",
            },
        ]
    )

    reopened = VectorDrawingMeaningStore(engine=FakeEmbeddingEngine(), db_path=db_path)

    assert reopened.get_all_meaning_ids() == {"water", "music"}
    assert reopened.search_meanings("jazz song", top_k=3) == [
        "Drawing meaning: music. Can I listen to music? Context: A drawing of musical notes usually means the patient wants music or familiar songs."
    ]


def test_drawing_meanings_sync_removes_stale_rows(tmp_path):
    store = VectorDrawingMeaningStore(engine=FakeEmbeddingEngine(), db_path=tmp_path / "lancedb_data")
    store.sync_meanings(
        [
            {
                "meaning_id": "water",
                "label": "water",
                "aliases": ["cup"],
                "category": "basic_needs",
                "intent_template": "I'm thirsty, can I have water?",
                "context": "A cup drawing means the patient wants water.",
            },
            {
                "meaning_id": "music",
                "label": "music",
                "aliases": ["jazz"],
                "category": "comfort",
                "intent_template": "Can I listen to music?",
                "context": "Musical notes mean the patient wants music.",
            },
        ]
    )

    store.sync_meanings(
        [
            {
                "meaning_id": "water",
                "label": "water",
                "aliases": ["cup"],
                "category": "basic_needs",
                "intent_template": "I'm thirsty, can I have water?",
                "context": "A cup drawing means the patient wants water.",
            }
        ]
    )

    assert store.get_all_meaning_ids() == {"water"}
    assert store.search_meanings("jazz", top_k=3) == []


def test_learned_meanings_persist_and_remain_patient_scoped(tmp_path):
    db_path = tmp_path / "lancedb_data"
    store = VectorLearnedDrawingMeaningStore(
        engine=FakeEmbeddingEngine(),
        db_path=db_path,
    )
    store.upsert_meaning_sync(1, "PatientA", "NOTE", "Play my jazz music")
    store.upsert_meaning_sync(2, "PatientB", "NOTE", "Call the nurse")

    reopened = VectorLearnedDrawingMeaningStore(
        engine=FakeEmbeddingEngine(),
        db_path=db_path,
    )

    assert reopened.search_meanings("PatientA", "music", top_k=3) == [
        "Patient-learned drawing meaning: NOTE. For this patient, it means: Play my jazz music"
    ]
    assert reopened.search_meanings("PatientB", "music", top_k=3) == []


def test_learned_meaning_sync_updates_and_deletes_rows(tmp_path):
    store = VectorLearnedDrawingMeaningStore(
        engine=FakeEmbeddingEngine(),
        db_path=tmp_path / "lancedb_data",
    )
    store.sync_meanings([(1, "PatientA", "NOTE", "Play my jazz music")])
    store.sync_meanings([(1, "PatientA", "NOTE", "Play favorite music")])

    assert store.search_meanings("PatientA", "music", top_k=3) == [
        "Patient-learned drawing meaning: NOTE. For this patient, it means: Play favorite music"
    ]

    store.sync_meanings([])
    assert store.search_meanings("PatientA", "music", top_k=3) == []

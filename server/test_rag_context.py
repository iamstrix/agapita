from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import AIEngine


class FakePatientRecordStore:
    def search(self, patient_id, query, top_k=2, similarity_threshold=0.40):
        assert patient_id == "patient"
        assert query == "cup"
        assert top_k == 2
        assert similarity_threshold == 0.40
        return ["PATIENT PREFERENCE: Strong preference for herbal tea over coffee."]


class FakeDrawingMeaningStore:
    def search_meanings(self, query, top_k=3, similarity_threshold=0.40):
        assert query == "cup"
        assert top_k == 3
        assert similarity_threshold == 0.40
        return ["Drawing meaning: water. I'm thirsty, can I have water? Context: A cup or glass usually means the patient wants a drink."]


class FakeLearnedDrawingMeaningStore:
    def search_meanings(self, patient_id, query, top_k=3, similarity_threshold=0.40):
        assert patient_id == "patient"
        assert query == "cup"
        assert top_k == 3
        assert similarity_threshold == 0.40
        return [
            "Patient-learned drawing meaning: CUP. "
            "For this patient, it means: I want herbal tea."
        ]


def test_build_rag_context_prioritizes_learned_meanings():
    engine = AIEngine(
        record_store=FakePatientRecordStore(),
        drawing_meaning_store=FakeDrawingMeaningStore(),
        learned_drawing_meaning_store=FakeLearnedDrawingMeaningStore(),
    )

    context = engine.build_rag_context("cup", "patient", patient_top_k=2, meaning_top_k=3)

    assert context == [
        "Patient-learned drawing meaning: CUP. For this patient, it means: I want herbal tea.",
        "PATIENT PREFERENCE: Strong preference for herbal tea over coffee.",
        "Drawing meaning: water. I'm thirsty, can I have water? Context: A cup or glass usually means the patient wants a drink.",
    ]

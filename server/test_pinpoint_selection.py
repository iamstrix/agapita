import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main


def test_pinpoint_selection_runs_fresh_time_aware_rag_and_streams(monkeypatch):
    calls = []
    emitted = []

    class FakeAIEngine:
        async def get_rag_cached(self, *args, **kwargs):
            raise AssertionError("P-Dollar tags must not use the intent cache")

        async def apply_rag(
            self,
            tag,
            patient_id,
            explicit_override=False,
            emit_chunk_cb=None,
        ):
            calls.append((tag, patient_id, explicit_override))
            await emit_chunk_cb("I need ")
            await emit_chunk_cb("water.")
            return "I need water."

    async def fake_emit(event, data, room=None):
        emitted.append((event, data, room))

    monkeypatch.setattr(main, "ai_engine", FakeAIEngine())
    monkeypatch.setattr(main.sio, "emit", fake_emit)
    monkeypatch.setitem(
        main.connected_users,
        "patient-sid",
        {"sub": "patient-1", "role": "patient"},
    )

    asyncio.run(
        main.pinpoint_selection(
            "patient-sid",
            {
                "tag": "cup",
                "patient_id": "ignored-client-id",
                "original_sketch": "data:image/png;base64,abc",
            },
        )
    )

    assert calls == [("cup", "patient-1", False)]
    assert emitted[:2] == [
        ("stream_chunk", {"chunk": "I need "}, "patient-sid"),
        ("stream_chunk", {"chunk": "water."}, "patient-sid"),
    ]
    assert emitted[2] == (
        "interpretation_received",
        {
            "intent": "I need water.",
            "options": ["water", "medication", "bathroom", "food"],
            "original_sketch": "data:image/png;base64,abc",
            "top_tag": "cup",
        },
        "patient-sid",
    )

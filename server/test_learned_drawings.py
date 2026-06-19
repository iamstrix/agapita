import asyncio
from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
import models


class FakeLearnedStore:
    def __init__(self):
        self.rows = {}

    def upsert_meaning_sync(self, meaning_id, patient_id, tag, meaning):
        self.rows[meaning_id] = (patient_id, tag, meaning)

    def delete_meaning(self, meaning_id):
        self.rows.pop(meaning_id, None)


def make_session():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    user = models.User(
        username="patient",
        hashed_password="unused",
        role=models.UserRole.PATIENT,
    )
    session.add(user)
    session.flush()
    patient = models.Patient(
        user_id=user.id,
        patient_id="patient",
        name="Test Patient",
    )
    session.add(patient)
    session.commit()
    return session, patient


def test_gesture_and_meaning_upsert_together(monkeypatch):
    session, patient = make_session()
    store = FakeLearnedStore()
    monkeypatch.setattr(
        main.auth,
        "decode_access_token",
        lambda _token: {"sub": "patient", "role": "patient"},
    )
    monkeypatch.setattr(main.ai_engine, "learned_drawing_meaning_store", store)

    first = asyncio.run(
        main.add_patient_gesture(
            main.GestureCreate(name="STAR", points="[1]", meaning="Look outside"),
            token="token",
            db=session,
        )
    )
    second = asyncio.run(
        main.add_patient_gesture(
            main.GestureCreate(name="STAR", points="[2]", meaning="Open the curtains"),
            token="token",
            db=session,
        )
    )

    gestures = session.query(models.CustomGesture).all()
    meanings = session.query(models.LearnedDrawingMeaning).all()
    assert first["id"] == second["id"]
    assert len(gestures) == 1
    assert gestures[0].points == "[2]"
    assert len(meanings) == 1
    assert meanings[0].meaning == "Open the curtains"
    assert list(store.rows.values()) == [
        (patient.patient_id, "STAR", "Open the curtains")
    ]


def test_deleting_gesture_deletes_linked_meaning(monkeypatch):
    session, _patient = make_session()
    store = FakeLearnedStore()
    monkeypatch.setattr(
        main.auth,
        "decode_access_token",
        lambda _token: {"sub": "patient", "role": "patient"},
    )
    monkeypatch.setattr(main.ai_engine, "learned_drawing_meaning_store", store)

    created = asyncio.run(
        main.add_patient_gesture(
            main.GestureCreate(name="BED", points="[1]", meaning="I need to rest"),
            token="token",
            db=session,
        )
    )
    asyncio.run(
        main.delete_patient_gesture(created["id"], token="token", db=session)
    )

    assert session.query(models.CustomGesture).count() == 0
    assert session.query(models.LearnedDrawingMeaning).count() == 0
    assert store.rows == {}

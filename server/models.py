from sqlalchemy import Column, Integer, String, ForeignKey, Table, Enum, UniqueConstraint
from sqlalchemy.orm import relationship, declarative_base
import enum

Base = declarative_base()

class UserRole(enum.Enum):
    ADMIN = "admin"
    CARETAKER = "caretaker"
    PATIENT = "patient"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(UserRole))

    # Relationships
    caretaker = relationship("Caretaker", back_populates="user", uselist=False)
    patient = relationship("Patient", back_populates="user", uselist=False)

class Caretaker(Base):
    __tablename__ = "caretakers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)

    user = relationship("User", back_populates="caretaker")
    patients = relationship("Patient", secondary="assignments", back_populates="caretakers")

class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    patient_id = Column(String, unique=True, index=True) # e.g. "PatientA"
    name = Column(String)

    user = relationship("User", back_populates="patient")
    medical_records = relationship("MedicalRecord", back_populates="patient")
    custom_gestures = relationship("CustomGesture", back_populates="patient")
    learned_drawing_meanings = relationship("LearnedDrawingMeaning", back_populates="patient")
    caretakers = relationship("Caretaker", secondary="assignments", back_populates="patients")

class MedicalRecord(Base):
    __tablename__ = "medical_records"
    id = Column(Integer, primary_key=True, index=True)
    patient_id_fk = Column(Integer, ForeignKey("patients.id"), nullable=True)
    content = Column(String)

    patient = relationship("Patient", back_populates="medical_records")

class CustomGesture(Base):
    __tablename__ = "custom_gestures"
    id = Column(Integer, primary_key=True, index=True)
    patient_id_fk = Column(Integer, ForeignKey("patients.id"))
    name = Column(String)
    points = Column(String) # JSON string of points

    patient = relationship("Patient", back_populates="custom_gestures")

class LearnedDrawingMeaning(Base):
    __tablename__ = "learned_drawing_meanings"
    __table_args__ = (
        UniqueConstraint("patient_id_fk", "tag", name="uq_learned_drawing_meaning_patient_tag"),
    )

    id = Column(Integer, primary_key=True, index=True)
    patient_id_fk = Column(Integer, ForeignKey("patients.id"), nullable=False)
    gesture_id_fk = Column(Integer, ForeignKey("custom_gestures.id"), nullable=False, unique=True)
    tag = Column(String, nullable=False)
    meaning = Column(String, nullable=False)

    patient = relationship("Patient", back_populates="learned_drawing_meanings")
    gesture = relationship("CustomGesture")

class Assignment(Base):
    __tablename__ = "assignments"
    caretaker_id = Column(Integer, ForeignKey("caretakers.id"), primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), primary_key=True)

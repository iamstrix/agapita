from sqlalchemy import Column, Integer, String, ForeignKey, Table, Enum
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
    caretakers = relationship("Caretaker", secondary="assignments", back_populates="patients")

class MedicalRecord(Base):
    __tablename__ = "medical_records"
    id = Column(Integer, primary_key=True, index=True)
    patient_id_fk = Column(Integer, ForeignKey("patients.id"))
    content = Column(String)

    patient = relationship("Patient", back_populates="medical_records")

class Assignment(Base):
    __tablename__ = "assignments"
    caretaker_id = Column(Integer, ForeignKey("caretakers.id"), primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), primary_key=True)

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime
import json

DATABASE_URL = "sqlite:///./audit_logs.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 1. The Audit Log (For Compliance - Permanent)
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    original_prompt_length = Column(Integer)
    threats_detected = Column(Integer)
    threat_types = Column(String)

# 2. The Privacy Session (For Unmasking - Temporary)
class PrivacySession(Base):
    __tablename__ = "privacy_sessions"
    
    session_id = Column(String, primary_key=True, index=True) # The "Key" we give the user
    entity_mapping = Column(Text) # We store the secret dictionary as a JSON string
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
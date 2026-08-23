---
title: Cloak-API
emoji: 🛡️
colorFrom: indigo
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# 🛡️ CloakEnt | Enterprise AI Data Firewall & DLP Gateway

[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-24.0-2496ED.svg)](https://www.docker.com/)
[![Hugging Face](https://img.shields.io/badge/Deployed%20on-Hugging%20Face-FFD21E.svg)](https://huggingface.co/spaces)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000.svg)](https://vercel.com/)

**CloakEnt** is a Zero-Trust Data Loss Prevention (DLP) gateway designed to secure enterprise interactions with public AI models. It acts as an intelligent firewall, intercepting and redacting Sensitive Personally Identifiable Information (PII) and Developer Secrets before they leave your secure environment. 

This system implements a sophisticated Microservices Orchestrator Architecture, separating security logic from AI processing to ensure maximum data sovereignty and compliance.

---

## 🚀 Live Demo

* **Frontend UI (Chat & Telemetry Interface):** [cloakent-api-website.vercel.app](https://cloak-api.vercel.app/)
* **Backend Security Engine (API Docs):** [cloakent-api.hf.space](https://pritu16345-cloak-api.hf.space/docs)

---

## 🚀 Key Capabilities & Features

* **Zero-Trust Orchestration**: A middleware-based orchestrator that ensures no sensitive data reaches public LLMs (e.g., GPT-120b, Groq) by sanitizing inputs in real-time.
* **Dual-Engine NLP Detection**: Combines **Microsoft Presidio** (Pattern Matching) with **spaCy Transformers** (`en_core_web_trf` for Context-aware NLP) for high-accuracy redaction.
* **Context-Aware Pre-Masking (Multi-Turn Memory)**: An intelligent loop that aggressively pre-masks known session entities (even in lowercase/informal formats) to prevent multi-turn context leakage.
* **DevSecOps Secrets Scanning**: Active pattern recognizers designed to detect and redact critical engineering credentials:
  * AWS Access Keys
  * GitHub Personal Access Tokens (PATs)
  * Google/Gemini API Keys
  * JWT Bearer Tokens
  * Generic Application Secrets
* **India-Specific PII Support**:
  * 🇮🇳 Aadhaar Cards
  * 🇮🇳 PAN Cards
  * 🇮🇳 Voter IDs
  * Emails, Phone Numbers, and Names
* **Live Security Inspector**: A real-time monitoring terminal in the UI that displays the full data journey (Interception → Redaction → AI Processing → Restoration).
* **Bidirectional Anonymization**: Automatically "unmasks" AI responses, preserving the context of the conversation for the user while guaranteeing the data remained hidden from the AI.
* **Audit Logging & Compliance Export**: Tracks all redaction events in a secure SQLite database for security auditing, with a 1-click **CSV Export** feature for compliance reporting.

---

## 🛠️ Tech Stack & Architecture

* **Backend Framework**: FastAPI (Python)
* **Middleware Proxy**: Vercel Serverless Edge Functions (`api/chat.js`)
* **NLP Engine**: spaCy (`en_core_web_trf`)
* **PII Detection**: Microsoft Presidio Analyzer & Anonymizer
* **Database**: SQLite + SQLAlchemy (Ephemeral Session Mapping)
* **Containerization**: Docker (Optimized for Hugging Face Spaces)
* **Frontend UI**: Vanilla JavaScript, Tailwind CSS (Glassmorphism & Live Telemetry)

---

## 📂 Project Structure

```text
CloakEnt/
├── api/
│   └── chat.js          # 🌐 Node.js Secure Middleware (Orchestrator)
├── main.py              # 🧠 Core Python API (Anonymize/Deanonymize & DevSecOps Logic)
├── database.py          # 🗄️ SQLAlchemy Models & Audit Logging
├── Dockerfile           # 🐳 Multi-layer Container Configuration
├── requirements.txt     # 📦 Pinned Project Dependencies
├── index.html           # 🎨 Frontend Interface (Vercel)
├── script.js            # ⚡ UI Logic, Telemetry, & Middleware Integration
├── style.css            # 💅 Enterprise Dark Theme Styling
└── README.md            # 📄 System Documentation
```

---

## ⚡ Getting Started (Local Development)

### Prerequisites
- Python 3.9+
- Node.js (for Vercel CLI/Middleware)
- Git

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Pritam16345/cloak-API.git
   cd cloak-API
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Backend Security Server (FastAPI):**
   ```bash
   uvicorn main:app --reload --port 8000
   ```

4. **Configure Environment Variables:**
   Create a `.env` file in the root directory for your Middleware proxy to utilize.
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

---

## 🛡️ Security & Privacy Architecture

* **Local Processing Guarantee:** When deployed locally or on a private VPC, no PII data leaves your internal network. Only fully anonymized tokens (e.g., `[PERSON_1]`) are dispatched to external AI APIs.
* **Ephemeral Session Storage:** Session mapping data (used to deanonymize the AI's response) is managed efficiently in SQLite and can be scoped to ephemeral lifecycles depending on deployment environment (e.g., container memory).

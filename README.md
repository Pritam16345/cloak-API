# 🛡️ CloakEnt | Enterprise AI Data Firewall

[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-24.0-2496ED.svg)](https://www.docker.com/)
[![Hugging Face](https://img.shields.io/badge/Deployed%20on-Hugging%20Face-FFD21E.svg)](https://huggingface.co/spaces)

**CloakEnt** is a Zero-Trust Data Loss Prevention (DLP) gateway designed to secure enterprise interactions with public AI models. It acts as an intelligent firewall, intercepting and redacting Sensitive Personally Identifiable Information (PII) before it leaves your secure environment. This version implements a sophisticated Microservices Orchestrator Architecture, separating security logic from AI processing to ensure maximum data sovereignty.

---

## 🚀 Live Demo

* **Frontend (Chat Interface):** [cloakent-api-website.vercel.app](https://cloak-api.vercel.app/)
* **Backend (API Docs):** Hosted on Hugging Face Spaces [cloakent-api.hf.space](https://pritu16345-cloak-api.hf.space)



## 🚀 Key Features

* **Zero-Trust Orchestration**: Implements a middleware-based orchestrator that ensures no sensitive data reaches public LLMs (like GPT-4 or Gemini) by sanitizing inputs in real-time.
* **Dual-Engine Detection**: Combines **Microsoft Presidio** (Pattern Matching) with **Spacy Transformers** (Context-aware NLP) for high-accuracy redaction.
* **India-Specific PII Support**:
*  Specialized recognizers for:
    * 🇮🇳 Aadhaar Cards
    * 🇮🇳 PAN Cards
    * 🇮🇳 Voter IDs
    * Emails
* **Document Intelligence**: Built-in support for parsing and sanitizing **PDF documents** (e.g., resumes, invoices).
* **Live Security Inspector**: A real-time monitoring terminal in the UI that displays the full data journey: Interception → Redaction → AI Processing → Restoration.
* **Bidirectional Anonymization**: Automatically "unmasks" AI responses, preserving the context of the conversation for the user while keeping the data hidden from the AI.
* **Audit Logging**: Tracks all redaction events in a secure SQLite database for compliance and security auditing.

---

## 🛠️ Tech Stack

* **Backend Framework**: FastAPI (Python)
* **Middleware Orchestrator**: Node.js (Vercel Serverless Functions)
* **NLP Engine**: Spacy (`en_core_web_trf` for production accuracy)
* **PII Detection**: Microsoft Presidio Analyzer & Anonymizer
* **Database**: SQLite + SQLAlchemy (Audit Logs)
* **Containerization**: Docker (Optimized for Hugging Face Spaces)
* **Frontend**: Vanilla JavaScript, Tailwind CSS (Glassmorphism UI)

---

## 📂 Project Structure

```text
CloakEnt/
├── api/
│   └── chat.js          # 🌐 Node.js Secure Middleware (Orchestrator)
├── main.py              # 🧠 Core Python API (Anonymize/Deanonymize Logic)
├── database.py          # 🗄️ SQLAlchemy Models & Audit Logging
├── Dockerfile           # 🐳 Multi-layer Container Configuration
├── requirements.txt     # 📦 Pinned Project Dependencies
├── index.html           # 🎨 Frontend Interface (Vercel)
├── script.js            # ⚡ UI Logic & Middleware Integration
├── style.css            # 💅 Enterprise Dark Theme Styling
└── README.md            # 📄 Professional Documentation
```

## ⚡ Getting Started (Local)

Prerequisites :-

Python 3.9+

Node.js (for Middleware)

Git

Installation :-

Clone the repository:

git clone https://github.com/Pritam16345/cloak-API.git

cd cloak-API


Install Python dependencies:

pip install -r requirements.txt


Run the Backend Server:

uvicorn main:app --reload --port 8000


Create a .env file for your Middleware:

GEMINI_API_KEY=your_google_gemini_api_key_here


## 🛡️ Security & Privacy
Local Processing: When running locally, no data leaves your machine.

Ephemeral Storage: In the cloud deployment, uploaded files are processed in memory and not permanently stored on the disk.

Audit Logs: Sensitive data in logs is hashed or masked based on configuration.


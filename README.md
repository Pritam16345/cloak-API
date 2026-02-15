# 🛡️ CloakEnt | Enterprise AI Data Firewall

[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-24.0-2496ED.svg)](https://www.docker.com/)
[![Hugging Face](https://img.shields.io/badge/Deployed%20on-Hugging%20Face-FFD21E.svg)](https://huggingface.co/spaces)

**CloakEnt** is a Zero-Trust Data Loss Prevention (DLP) gateway designed to secure enterprise interactions with public AI models. It acts as an intelligent firewall, intercepting and redacting Sensitive Personally Identifiable Information (PII) before it leaves your secure environment.

---

## 🚀 Live Demo

* **Frontend (Chat Interface):** [cloakent-api-website.vercel.app](https://cloak-api.vercel.app/)
* **Backend (API Docs):** Hosted on Hugging Face Spaces [cloakent-api.hf.space](https://pritu16345-cloak-api.hf.space)



## 🚀 Key Features

* **Zero-Trust Architecture**: Ensures no sensitive data reaches public LLMs (like GPT-4 or Gemini) by sanitizing inputs in real-time.
* **Dual-Engine Detection**: Combines **Microsoft Presidio** (Pattern Matching) with **Spacy Transformers** (Context-aware NLP) for high-accuracy redaction.
* **India-Specific PII Support**:
*  Specialized recognizers for:
    * 🇮🇳 Aadhaar Cards
    * 🇮🇳 PAN Cards
    * 🇮🇳 Voter IDs
    * 🇮🇳 Indian Passports
* **Document Intelligence**: Built-in support for parsing and sanitizing **PDF documents** (e.g., resumes, invoices).
* **Bidirectional Anonymization**: Automatically "unmasks" AI responses, preserving the context of the conversation for the user while keeping the data hidden from the AI.
* **Audit Logging**: Tracks all redaction events in a secure SQLite database for compliance and security auditing.

---

## 🛠️ Tech Stack

* **Backend Framework**: FastAPI (Python)
* **NLP Engine**: Spacy (`en_core_web_trf` for production, `sm` for lightweight)
* **PII Detection**: Microsoft Presidio Analyzer & Anonymizer
* **Database**: SQLite + SQLAlchemy (Audit Logs)
* **Containerization**: Docker (Optimized for Hugging Face Spaces)
* **Frontend**: Vanilla JavaScript, Tailwind CSS (Glassmorphism UI)

---

## 📂 Project Structure

```text
CloakEnt/
├── main.py              # 🧠 Core API Logic & PII Redaction Pipeline
├── database.py          # 🗄️ Database Models & Audit Logging
├── Dockerfile           # 🐳 Cloud Deployment Configuration
├── requirements.txt     # 📦 Project Dependencies
├── index.html           # 🎨 Frontend Chat Interface
├── script.js            # ⚡ Frontend Logic & API Integration
├── style.css            # 💅 Custom Styling
└── README.md            # 📄 Project Documentation
```

## ⚡ Getting Started (Local)

Prerequisites

Python 3.9+

Git

Clone the repository : 
git clone [https://github.com/Pritam16345/cloak-API.git](https://github.com/Pritam16345/cloak-API.git)

cd cloak-API

Install dependencies :

pip install -r requirements.txt

Download the Spacy NLP Model: python -m spacy download en_core_web_trf

Run the Server :

uvicorn main:app --reload
Access the API at http://127.0.0.1:8000.


## 🛡️ Security & Privacy
Local Processing: When running locally, no data leaves your machine.
Ephemeral Storage: In the cloud deployment, uploaded files are processed in memory and not permanently stored on the disk.
Audit Logs: Sensitive data in logs is hashed or masked based on configuration.

## 📜 License
This project is open-source and available under the MIT License.

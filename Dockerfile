# Use a lightweight Python 3.11 base image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies needed for SpaCy and PII analysis
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the heavy Transformer model (Hugging Face has the RAM for this!)
RUN python -m spacy download en_core_web_trf

# Copy the rest of your application code
COPY . .

# Expose port 7860 (The standard port for Hugging Face Spaces)
EXPOSE 7860

# Command to run your FastAPI app
# Note: Hugging Face requires the app to run on port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
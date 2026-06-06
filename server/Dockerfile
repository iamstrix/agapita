FROM python:3.11-slim

WORKDIR /app/server

# Install system dependencies if required (e.g. for Pillow)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Do not copy all source files since we will mount the directory in dev mode
# But it's good practice to copy them in case the image is run standalone
COPY . .

EXPOSE 8000

# Start server using uvicorn directly
CMD ["uvicorn", "main:socket_app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

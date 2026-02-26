FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy app source
COPY . /app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Use app.py since it reads the PORT env var directly
CMD ["python", "app.py"]

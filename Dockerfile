# ==============================================================================
# Multi-Stage Dockerfile for Hugging Face Spaces (Docker SDK)
# ==============================================================================

# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Backend Container
FROM python:3.11-slim

# Create standard non-root user (UID 1000 required by Hugging Face Spaces)
RUN useradd -m -u 1000 user

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r ./backend/requirements.txt

# Copy backend source code
COPY backend/ ./backend

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure permissions for user 1000
RUN mkdir -p /app/data && chown -R user:user /app

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    DATABASE_URL="sqlite+aiosqlite:////app/data/qa_platform.db"

# Expose Hugging Face standard port
EXPOSE 7860

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "7860"]

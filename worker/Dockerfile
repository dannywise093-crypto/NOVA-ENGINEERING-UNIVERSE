FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    freecad \
    calculix-ccx \
    python3 \
    python3-pip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
COPY main.py .
RUN useradd --create-home --uid 10001 worker && mkdir -p /tmp/engineering-jobs && chown -R worker:worker /tmp/engineering-jobs /app
USER worker
ENV JOB_ROOT=/tmp/engineering-jobs
EXPOSE 10000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]

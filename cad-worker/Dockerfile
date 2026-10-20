FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONPATH=/usr/lib/freecad-python3/lib:/usr/share/freecad/Mod:/usr/lib/freecad/lib
ENV QT_QPA_PLATFORM=offscreen
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip freecad python3-freecad ca-certificates libgl1 libglib2.0-0 libnss3 libx11-6 libxkbcommon0 libasound2 && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --break-system-packages playwright && python3 -m playwright install chromium
WORKDIR /app
COPY server.py /app/server.py
ENV CAD_WORKER_HOST=0.0.0.0
EXPOSE 8787
CMD ["python3","/app/server.py"]

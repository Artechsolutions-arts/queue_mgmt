################# build stage #################
FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build
COPY requirements.txt .
RUN pip wheel --wheel-dir=/wheels -r requirements.txt

################# runtime stage #################
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ASSET_DIR=/app/vision_assets

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 ffmpeg tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app && useradd -r -g app -d /app -s /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels

COPY --chown=app:app . .

RUN install -d -o app -g app /app/vision_assets /app/vision_assets/frames \
    && ln -s /app/vision_assets/deploy.prototxt /app/deploy.prototxt \
    && ln -s /app/vision_assets/mobilenet_iter_73000.caffemodel /app/mobilenet_iter_73000.caffemodel \
    && ln -s /app/vision_assets/test_video.mp4 /app/test_video.mp4 \
    && chown -h app:app /app/deploy.prototxt /app/mobilenet_iter_73000.caffemodel /app/test_video.mp4

USER app

VOLUME ["/app/vision_assets"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import os, time, sys; sys.exit(0 if any(time.time() - os.path.getmtime(os.path.join(r,f)) < 120 for r,_,fs in os.walk('/app/vision_assets/frames') for f in fs) else 1)" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "vision_service.py"]

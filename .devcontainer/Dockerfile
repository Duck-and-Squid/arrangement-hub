FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Install MuseScore 4
RUN curl -L -o /tmp/MuseScore.AppImage \
      https://github.com/musescore/MuseScore/releases/download/v4.5.2/MuseScore-Studio-4.5.2.251150648-aarch64.AppImage \
    && echo "e1ad0e205dc056be4fc23cb28bafa95bb91be58c9a215383be93d7bed4d17605  /tmp/MuseScore.AppImage" | sha256sum -c - \
    && chmod +x /tmp/MuseScore.AppImage \
    && /tmp/MuseScore.AppImage --appimage-extract \
    && cp -a squashfs-root/ /opt/musescore \
    && ln -s /opt/musescore/AppRun /usr/local/bin/mscore \
    && rm -rf squashfs-root /tmp/MuseScore.AppImage

# Install runtime dependencies for MuseScore
RUN apt-get update && apt-get install -y \
    libnss3 \
    libopengl0 \
    libjack0 \
    libasound2 \
    libgl1 \
    libegl1 \
    && rm -rf /var/lib/apt/lists/*

# Setup QT for headless mode + XDG_RUNTIME_DIR
ENV QT_QPA_PLATFORM=offscreen
ENV XDG_RUNTIME_DIR=/tmp/xdg
RUN mkdir -p /tmp/xdg && \
    chown 1000:1000 /tmp/xdg && \
    chmod 700 /tmp/xdg

WORKDIR /root

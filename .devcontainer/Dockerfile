FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Install dependencies
RUN apt update && \
    apt install -y musescore && \
    rm -rf /var/cache/apt/archives /var/lib/apt/lists/*

WORKDIR /root

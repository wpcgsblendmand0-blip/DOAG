# Use highly compatible Node.js LTS image
FROM node:18-bullseye-slim

# Install system essentials professionally
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip professionally, using the system package break flag for Docker compatibility
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Set working directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Copy remaining source code (respects .dockerignore)
COPY . .

# Ensure required directories exist with correct permissions
RUN mkdir -p temp && chmod 777 temp

# Professional Port handling for Railway
ENV PORT=4173
EXPOSE ${PORT}

# Run the server
CMD ["node", "server.js"]

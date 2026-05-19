# Use highly compatible Node.js LTS image
FROM node:18-bullseye-slim

# Install system essentials professionally
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp in a virtual environment for maximum stability and Railway compliance
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip3 install --no-cache-dir yt-dlp

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

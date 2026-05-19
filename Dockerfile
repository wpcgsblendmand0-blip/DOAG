# Use Node.js base image
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp professionally via pip
RUN pip3 install yt-dlp

# Create app directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Create necessary folders for production logic
RUN mkdir -p temp 

# Expose the port Railway provides
EXPOSE 4173

# Start the server
CMD ["npm", "start"]

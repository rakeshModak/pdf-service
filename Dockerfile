FROM node:18

WORKDIR /usr/src/app

# Install system dependencies including build tools and graphics libraries
RUN apt-get update \
    && apt-get install -y build-essential python3 libcairo2-dev \
       libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
       wget gnupg ca-certificates fonts-liberation libappindicator3-1 \
       libasound2 libatk-bridge2.0-0 libdrm2 libxcomposite1 \
       libxdamage1 libxrandr2 libgbm1 libxss1 libgconf-2-4

# Install Chromium (works on both amd64 and arm64)
RUN apt-get update \
    && apt-get install -y chromium \
    && rm -rf /var/lib/apt/lists/*

# Install additional utilities
RUN wget --quiet https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh -O /usr/sbin/wait-for-it.sh \
    && chmod +x /usr/sbin/wait-for-it.sh \
    && apt-get update && apt-get install -y ghostscript ghostscript-x tzdata \
    && rm -rf /var/lib/apt/lists/*

# Set the timezone to IST (matching your location)
ENV TZ=Asia/Kolkata

# Set Puppeteer to skip downloading Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy package files
COPY package*.json ./

# Install dependencies with build support
RUN npm install --build-from-source

# Install PM2 globally for process management
RUN npm install pm2 -g

# Copy application code
COPY . .

# Create PM2 ecosystem file for better process management
RUN echo '{ \
  "apps": [{ \
    "name": "html-to-pdf-api", \
    "script": "server.js", \
    "instances": 1, \
    "exec_mode": "fork", \
    "env": { \
      "NODE_ENV": "production", \
      "PORT": 3000 \
    }, \
    "error_file": "/var/log/pm2/err.log", \
    "out_file": "/var/log/pm2/out.log", \
    "log_file": "/var/log/pm2/combined.log", \
    "time": true \
  }] \
}' > ecosystem.config.json

# Create log directory
RUN mkdir -p /var/log/pm2

EXPOSE 3000

# Use PM2 to run the application
ENTRYPOINT ["pm2-runtime", "ecosystem.config.json"]

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]
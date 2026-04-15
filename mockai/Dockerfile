# MockAI Dockerfile for Integration Testing
# This builds MockAI service from the parent repository
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files from MockAI
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy MockAI application files
COPY db ./db
COPY srv ./srv
COPY app ./app

# Expose port
EXPOSE 4004

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4004

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:4004/products || exit 1

# Start the service
CMD ["npm", "start"]

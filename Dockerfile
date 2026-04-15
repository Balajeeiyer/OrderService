# OrderService Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY db ./db
COPY srv ./srv

# Expose port
EXPOSE 4005

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4005

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4005/orders', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Start the service
CMD ["npm", "start"]

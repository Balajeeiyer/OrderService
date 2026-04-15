#!/bin/bash

# Script to prepare MockAI for Docker build
# Clones MockAI repository into mockai/ directory for Docker build context

set -e

echo "📦 Preparing MockAI for Docker build..."

# Check if we're in OrderService directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must be run from OrderService root directory"
    exit 1
fi

# Check if mockai directory exists
if [ -d "mockai/.git" ]; then
    echo "♻️  MockAI directory exists, pulling latest changes..."
    cd mockai
    git pull origin main
    cd ..
else
    echo "🔄 Cloning MockAI repository..."
    rm -rf mockai
    git clone https://github.com/Balajeeiyer/MockAI.git mockai
fi

# Copy only necessary files for Docker build
echo "📋 Copying MockAI files..."
mkdir -p mockai-build
cp mockai/package*.json mockai-build/
cp -r mockai/db mockai-build/
cp -r mockai/srv mockai-build/
if [ -d "mockai/app" ]; then
    cp -r mockai/app mockai-build/
fi

# Move Dockerfile into build context
cp mockai/Dockerfile mockai-build/ 2>/dev/null || echo "Using Dockerfile from mockai/ directory"

echo "✅ MockAI prepared for Docker build"
echo "   Build context: mockai-build/"

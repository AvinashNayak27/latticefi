#!/bin/bash

# Avantis Trader MVP - Start Script
# This script starts both frontend and backend in separate terminal windows

echo "🚀 Starting Avantis Trader MVP..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if dependencies are installed
if [ ! -d "backend/.venv" ]; then
    echo "❌ Backend dependencies not found. Run ./install.sh first."
    exit 1
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "❌ Frontend dependencies not found. Run ./install.sh first."
    exit 1
fi

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo -e "${BLUE}Starting Backend...${NC}"
    osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/backend && source .venv/bin/activate && sh uvicorn_app.sh"'
    
    sleep 2
    
    echo -e "${BLUE}Starting Frontend...${NC}"
    osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/frontend && npm run dev"'
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo -e "${BLUE}Starting Backend...${NC}"
    gnome-terminal -- bash -c "cd $(pwd)/backend && source .venv/bin/activate && sh uvicorn_app.sh; exec bash"
    
    sleep 2
    
    echo -e "${BLUE}Starting Frontend...${NC}"
    gnome-terminal -- bash -c "cd $(pwd)/frontend && npm run dev; exec bash"
    
else
    echo "Unsupported OS. Please start manually:"
    echo ""
    echo "Terminal 1: cd backend && source .venv/bin/activate && sh uvicorn_app.sh"
    echo "Terminal 2: cd frontend && npm run dev"
    exit 1
fi

sleep 3

echo ""
echo -e "${GREEN}✅ Avantis Trader is starting!${NC}"
echo ""
echo "Backend: https://avantis-backend.vercel.app"
echo "Frontend: http://localhost:5173"
echo ""
echo "Check the new terminal windows for logs."


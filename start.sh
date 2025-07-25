#!/bin/bash

echo "Starting GeoTIFF Viewer..."
echo

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/upgrade dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Start the application
echo
echo "Starting FastAPI server..."
echo "Open your browser and go to: http://localhost:8000"
echo "Press Ctrl+C to stop the server"
echo

python main.py

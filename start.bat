@echo off
echo Starting GeoTIFF Viewer...
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate

REM Install/upgrade dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Start the application
echo.
echo Starting FastAPI server...
echo Open your browser and go to: http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

python main.py

pause

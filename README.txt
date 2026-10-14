BREAK ATTENDANCE CALCULATOR

1. Open PowerShell in this folder.
2. python -m venv venv
3. .\venv\Scripts\Activate.ps1
4. python -m pip install -r requirements.txt
5. Install Tesseract OCR for Windows.
6. python app.py
7. Open http://127.0.0.1:5000

The app supports screenshot OCR, raw OCR text display, manual attendance input,
automatic IN/OUT parsing, overnight shifts, duplicate consecutive IN/OUT
records being ignored, swipe breaks, manual break tracking and expected OUT.

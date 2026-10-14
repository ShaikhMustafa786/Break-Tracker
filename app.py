from flask import Flask, render_template, request, jsonify
from PIL import Image
import pytesseract
import re
from datetime import datetime
import os

app = Flask(__name__)

# Tesseract path for Windows only
if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )

DEFAULT_WORK_SECONDS = 8 * 60 * 60

# Automatically find common Windows Tesseract installations.
# Tesseract path for Windows only
if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )


def format_duration(seconds):
    seconds = max(0, int(seconds))
    return f"{seconds//3600:02d}:{(seconds%3600)//60:02d}:{seconds%60:02d}"


def format_time(seconds):
    seconds = int(seconds) % 86400
    return f"{seconds//3600:02d}:{(seconds%3600)//60:02d}:{seconds%60:02d}"


def time_to_seconds(hour, minute, second=0, period=None):
    hour, minute, second = int(hour), int(minute), int(second)
    if period:
        period = period.upper()
        if hour <= 12:
            if period == "PM" and hour != 12:
                hour += 12
            elif period == "AM" and hour == 12:
                hour = 0
    return hour * 3600 + minute * 60 + second


def parse_explicit_records(text):
    pattern = re.compile(
        r"(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[:\-]?\s*"
        r"(in|out)\s*(?:\(\s*([^)]+)\s*\))?",
        re.I
    )
    records = []
    for m in pattern.finditer(text):
        h, minute = int(m.group(1)), int(m.group(2))
        sec = int(m.group(3) or 0)
        if h > 23 or minute > 59 or sec > 59:
            continue
        seconds = time_to_seconds(h, minute, sec)
        records.append({
            "seconds": seconds,
            "display": format_time(seconds),
            "event": m.group(4).upper(),
            "location": (m.group(5) or "").strip(),
            "source": "explicit"
        })
    return records


def parse_timestamp_records(text):
    pattern = re.compile(
        r"\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM)?\b",
        re.I
    )
    records = []
    for m in pattern.finditer(text):
        seconds = time_to_seconds(
            int(m.group(1)), int(m.group(2)), int(m.group(3) or 0), m.group(4)
        )
        records.append({
            "seconds": seconds,
            "display": format_time(seconds),
            "event": None,
            "location": "",
            "source": "timestamp"
        })
    return records


def normalize_records(records):
    if not records:
        return []
    result = []
    offset = 0
    previous_clock = records[0]["seconds"]

    for index, record in enumerate(records):
        if index and record["seconds"] < previous_clock:
            offset += 86400
        item = record.copy()
        item["absolute_seconds"] = item["seconds"] + offset
        item["duplicate"] = False
        item["duplicate_reason"] = ""
        result.append(item)
        previous_clock = record["seconds"]

    for i in range(1, len(result)):
        if result[i-1]["event"] and result[i]["event"] == result[i-1]["event"]:
            result[i]["duplicate"] = True
            result[i]["duplicate_reason"] = f"Duplicate {result[i]['event']} ignored"
    return result


def detect_records(text):
    records = parse_explicit_records(text)
    if not records:
        timestamps = parse_timestamp_records(text)
        unique, seen = [], set()
        for r in timestamps:
            if r["seconds"] not in seen:
                seen.add(r["seconds"])
                unique.append(r)
        for i, r in enumerate(unique):
            r["event"] = "IN" if i % 2 == 0 else "OUT"
        records = unique
    return normalize_records(records)


def calculate_attendance(records, required_work_seconds=DEFAULT_WORK_SECONDS,
                         manual_break_seconds=0):
    if not records:
        return {"success": False, "message": "No attendance records found."}

    effective = [r for r in records if not r["duplicate"]]
    if not effective:
        return {"success": False, "message": "No valid attendance records found."}

    worked = 0
    swipe_break = 0

    for previous, current in zip(effective, effective[1:]):
        duration = max(0, current["absolute_seconds"] - previous["absolute_seconds"])
        if previous["event"] == "IN" and current["event"] == "OUT":
            worked += duration
        elif previous["event"] == "OUT" and current["event"] == "IN":
            swipe_break += duration

    last = effective[-1]
    now = datetime.now()
    now_clock = now.hour * 3600 + now.minute * 60 + now.second
    first_clock = effective[0]["absolute_seconds"] % 86400
    difference = now_clock - first_clock
    if difference < 0:
        difference += 86400
    live_absolute = effective[0]["absolute_seconds"] + difference
    current_session = max(0, live_absolute - last["absolute_seconds"])

    if last["event"] == "IN":
        worked += current_session
    else:
        swipe_break += current_session

    manual_break_seconds = max(0, int(manual_break_seconds))
    worked = max(0, worked - manual_break_seconds)
    total_break = swipe_break + manual_break_seconds
    expected_out = effective[0]["absolute_seconds"] + required_work_seconds + total_break

    return {
        "success": True,
        "status": "WORKING" if last["event"] == "IN" else "ON BREAK",
        "office_in": format_time(effective[0]["absolute_seconds"]),
        "last_record": format_time(last["seconds"]),
        "last_event": last["event"],
        "worked_seconds": worked,
        "worked": format_duration(worked),
        "swipe_break_seconds": swipe_break,
        "swipe_break": format_duration(swipe_break),
        "manual_break_seconds": manual_break_seconds,
        "manual_break": format_duration(manual_break_seconds),
        "total_break_seconds": total_break,
        "total_break": format_duration(total_break),
        "current_session_seconds": current_session,
        "current_session": format_duration(current_session),
        "required_work_seconds": required_work_seconds,
        "required_work": format_duration(required_work_seconds),
        "expected_out_seconds": expected_out,
        "expected_out": format_time(expected_out),
        "record_count": len(records),
        "valid_record_count": len(effective),
        "duplicate_count": len(records) - len(effective),
        "records": records
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/ocr", methods=["POST"])
def ocr_api():
    if "image" not in request.files:
        return jsonify(success=False, message="No image uploaded."), 400
    image_file = request.files["image"]
    if not image_file.filename:
        return jsonify(success=False, message="Please select an image."), 400
    try:
        image = Image.open(image_file)
        text = pytesseract.image_to_string(image)
        records = detect_records(text)
        return jsonify(success=True, ocr_text=text, records=records,
                       calculation=calculate_attendance(records))
    except pytesseract.pytesseract.TesseractNotFoundError:
        return jsonify(
            success=False,
            message="Tesseract OCR is not installed or cannot be found."
        ), 500
    except Exception as error:
        return jsonify(success=False, message=str(error)), 500


@app.route("/api/calculate", methods=["POST"])
def calculate_api():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", ""))
    if not text.strip():
        return jsonify(success=False, message="Attendance text is empty."), 400
    required = int(data.get("required_work_seconds", DEFAULT_WORK_SECONDS))
    manual = int(data.get("manual_break_seconds", 0))
    records = detect_records(text)
    return jsonify(calculate_attendance(records, required, manual))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

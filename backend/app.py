#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import base64
import logging
from typing import Optional, Dict, Any

import requests
import json
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ============================================================
# ===============   KONFIGURATION KI-ANALYSE   ===============
# ============================================================
API_URL = "https://openrouter.ai/api/v1/chat/completions"
API_KEY = os.getenv("OPENROUTER_API_KEY")

MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")
PDF_ENGINE = os.getenv("PDF_ENGINE", "pdf-text")  # "pdf-text", "mistral-ocr", "native"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}" if API_KEY else "",
    "HTTP-Referer": "http://localhost",
    "X-Title": "Credit-Rating-Tool",
    "Content-Type": "application/json",
}

# ============================================================
# ===============   LOGGING KONFIGURATION    =================
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ============================================================
# ===============   HILFSFUNKTIONEN        ===================
# ============================================================
def encode_pdf_to_data_url_bytes(pdf_bytes: bytes) -> str:
    """Nimmt PDF-Bytes und liefert eine data:application/pdf;base64,... URL zurück."""
    b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return f"data:application/pdf;base64,{b64}"

def is_url(s: str) -> bool:
    return isinstance(s, str) and s.lower().startswith(("http://", "https://"))

def parse_json_response(content: str) -> dict:
    """
    Versucht, aus der Modellantwort ein JSON-Objekt zu extrahieren.
    - Entfernt ggf. ```json ... ``` Codeblöcke
    - Versucht, den Teil zwischen erstem '{' und letztem '}' zu parsen
    """
    text = content.strip()

    # 1) Falls das Modell in ```json ... ``` antwortet → Fences entfernen
    if text.startswith("```"):
        lines = text.splitlines()
        # Erste Zeile ist oft ```json oder ``` → entfernen
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        # Letzte Zeile kann wieder ``` sein → entfernen
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # 2) Direktes JSON-Parsing versuchen
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 3) Versuchen, den JSON-Teil zwischen erstem '{' und letztem '}' zu extrahieren
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        return json.loads(candidate)

    # 4) Wenn alles fehlschlägt → Fehler weitergeben
    raise json.JSONDecodeError("Konnte kein gültiges JSON extrahieren", text, 0)

# ============================================================
# === LLM-ANBINDUNG: SCORE + SWOT AUS LAGEBERICHT (PDF) ======
# ============================================================
def query_model_with_pdf_for_score_and_swot(
    pdf_source: str,
    filename: Optional[str] = "lagebericht.pdf",
) -> Dict[str, Any]:
    """
    Sendet eine PDF an das LLM über OpenRouter und erwartet ein JSON mit:
      - model_version
      - company_name (z.B. "Adidas AG")
      - risk_score_0_to_10
      - overall_risk_assessment_text
      - key_downgrade_drivers
      - swot: {strengths, weaknesses, opportunities, threats}
    """

    if not API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY ist nicht gesetzt.")

    # File-Block wie in deinem bestehenden Skript
    if is_url(pdf_source):
        file_block = {
            "type": "file",
            "file": {
                "filename": filename or "document.pdf",
                "fileData": pdf_source,
            },
        }
    else:
        if not pdf_source.startswith("data:application/pdf;base64,"):
            raise ValueError("pdf_source ist keine URL und keine gültige data:application/pdf;base64,... Zeichenkette.")
        file_block = {
            "type": "file",
            "file": {
                "filename": filename or "document.pdf",
                "file_data": pdf_source,
            },
        }

    # Prompt: Score + SWOT im JSON-Format
    system_prompt = (
        "Du bist ein erfahrener Kreditrisiko-Analyst. "
        "Du analysierst deutsche Lageberichte börsennotierter Unternehmen. "
        "Deine Aufgaben:\n"
        "1. Bestimme einen Risikoscore von 0 bis 10, der die Wahrscheinlichkeit "
        "für ein Rating-Downgrade des Issuer Credit Ratings im Folgejahr beschreibt "
        "(0 = kein erkennbares Risiko, 10 = sehr hohes Risiko).\n"
        "2. Bestimme den vollständigen offiziellen Unternehmensnamen inklusive Rechtsform "
        "(z.B. \"Adidas AG\") so wie er im Lagebericht verwendet wird.\n"
        "3. Erstelle eine SWOT-Analyse aus Sicht des Kreditrisikos:\n"
        "   - Stärken (risikomindernde Faktoren im Unternehmen)\n"
        "   - Schwächen (risikoerhöhende interne Faktoren)\n"
        "   - Chancen (kreditrisikomindernde externe Entwicklungen)\n"
        "   - Risiken (kreditrisikoerhöhende externe Faktoren).\n"
        "Nutze ausschließlich Informationen aus dem Lagebericht. "
        "Verwende kein externes Weltwissen über das konkrete Unternehmen.\n\n"
        "Antwort-Format:\n"
        "Gib ausschließlich ein gültiges JSON-Objekt mit genau dieser Struktur zurück:\n"
        "{\n"
        '  \"model_version\": \"<Modellname oder -version>\",\n'
        '  \"company_name\": \"<Vollständiger Unternehmensname inkl. Rechtsform, z.B. \\\"Adidas AG\\\">\",\n'
        '  \"risk_score_0_to_10\": <Zahl 0-10>,\n'
        '  \"overall_risk_assessment_text\": \"<kurze verbale Gesamteinschätzung>\",\n'
        '  \"key_downgrade_drivers\": [\"<Stichpunkt 1>\", \"<Stichpunkt 2>\", ...],\n'
        "  \"swot\": {\n"
        '    \"strengths\": [\"<Stärke 1>\", \"<Stärke 2>\", ...],\n'
        '    \"weaknesses\": [\"<Schwäche 1>\", \"<Schwäche 2>\", ...],\n'
        '    \"opportunities\": [\"<Chance 1>\", \"<Chance 2>\", ...],\n'
        '    \"threats\": [\"<Risiko 1>\", \"<Risiko 2>\", ...]\n'
        "  }\n"
        "}\n"
        "Kein Fließtext außerhalb des JSON, keine Kommentare, keine zusätzlichen Felder."
    )

    user_text = (
        "Analysiere den beigefügten Lagebericht des Unternehmens. "
        "Bestimme den Risikoscore, den vollständigen Unternehmensnamen und erstelle die kreditrisikobezogene SWOT-Analyse. "
        "Denke daran: Antworte ausschließlich mit einem JSON-Objekt im vorgegebenen Format."
    )

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    file_block,
                ],
            },
        ],
        "plugins": [
            {
                "id": "file-parser",
                "pdf": {
                    "engine": PDF_ENGINE
                },
            }
        ],
        "temperature": 0.2,
    }

    logger.info("Sende Anfrage an OpenRouter...")
    r = requests.post(API_URL, headers=HEADERS, json=payload, timeout=300)
    r.raise_for_status()
    data = r.json()
    content = data["choices"][0]["message"]["content"]
    logger.info("Antwort vom Modell erhalten.")
    logger.info("Rohantwort (gekürzt): %s", content[:400])

    try:
        result = parse_json_response(content)
    except json.JSONDecodeError as e:
        logger.error(f"JSON-Parsing fehlgeschlagen: {e}. Antwort war: {content[:500]}...")
        raise

    return result

# ============================================================
# ==================   FASTAPI-APP   =========================
# ============================================================
app = FastAPI(title="Credit Risk LLM Analyzer")

# CORS für späteres Frontend (localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # für den Anfang offen, später einschränken
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL, "pdf_engine": PDF_ENGINE}

@app.post("/api/analyze-report")
async def analyze_report(file: UploadFile = File(...)):
    """
    Nimmt eine PDF per Upload entgegen, schickt sie an das LLM und gibt Score + SWOT + Firmennamen als JSON zurück.
    """
    if not API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY ist nicht gesetzt.")

    if file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(status_code=400, detail="Bitte eine PDF-Datei hochladen.")

    try:
        pdf_bytes = await file.read()
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Leere Datei erhalten.")

        data_url = encode_pdf_to_data_url_bytes(pdf_bytes)
        result = query_model_with_pdf_for_score_and_swot(
            pdf_source=data_url,
            filename=file.filename or "lagebericht.pdf",
        )
        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Fehler bei der Analyse")
        raise HTTPException(status_code=500, detail=f"Interner Fehler: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
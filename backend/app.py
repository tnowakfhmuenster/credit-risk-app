#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import base64
import logging
from typing import Optional, Dict, Any, List

import requests
import json
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from pdf_renderer import render_pdf_sync

# ============================================================
# ===============   KONFIGURATION KI-ANALYSE   ===============
# ============================================================
API_URL = "https://openrouter.ai/api/v1/chat/completions"
API_KEY = os.getenv("OPENROUTER_API_KEY")

MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4.1-mini")
PDF_ENGINE = os.getenv("PDF_ENGINE", "pdf-text")  # "pdf-text", "mistral-ocr", "native"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}" if API_KEY else "",
    "HTTP-Referer": "http://localhost",
    "X-Title": "CreditTrend AI",
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
    b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return f"data:application/pdf;base64,{b64}"

def is_url(s: str) -> bool:
    return isinstance(s, str) and s.lower().startswith(("http://", "https://"))

def parse_json_response(content: str) -> dict:
    text = content.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start : end + 1])

    raise json.JSONDecodeError("Konnte kein gültiges JSON extrahieren", text, 0)

# ============================================================
# =======   LLM-ANBINDUNG – ANALYSE (Score + SWOT)   =========
# ============================================================
def query_model_with_pdf_for_score_and_swot(
    pdf_source: str,
    filename: Optional[str] = "lagebericht.pdf",
) -> Dict[str, Any]:

    if not API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY ist nicht gesetzt.")

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
            raise ValueError("Ungültige PDF-Quelle.")
        file_block = {
            "type": "file",
            "file": {
                "filename": filename or "document.pdf",
                "file_data": pdf_source,
            },
        }

    system_prompt = (
        "Du bist ein erfahrener Kreditrisiko-Analyst. ..."
        "(GANZER PROMPT — unverändert wie bisher)"
    )

    user_text = (
        "Analysiere den beigefügten Lagebericht ... Antwort ausschließlich im JSON-Format."
    )

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    file_block,
                ]
            }
        ],
        "plugins": [{"id": "file-parser", "pdf": {"engine": PDF_ENGINE}}],
        "temperature": 0.2,
    }

    logger.info("Sende Anfrage an OpenRouter…")
    r = requests.post(API_URL, headers=HEADERS, json=payload, timeout=300)
    r.raise_for_status()
    data = r.json()
    content = data["choices"][0]["message"]["content"]
    logger.info("Antwort erhalten.")

    return parse_json_response(content)

# ============================================================
# =================   FASTAPI MODELDEFINITIONEN ==============
# ============================================================
class SWOTModel(BaseModel):
    strengths: List[str]
    weaknesses: List[str]
    opportunities: List[str]
    threats: List[str]

class AnalysisResultModel(BaseModel):
    model_version: str
    company_name: str
    company_fiscal_year: str
    risk_score_0_to_10: float
    overall_risk_assessment_text: str
    key_downgrade_drivers: List[str]
    swot: SWOTModel

# ============================================================
# ==================   FASTAPI-APP   =========================
# ============================================================
app = FastAPI(title="CreditTrend AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL, "pdf_engine": PDF_ENGINE}

@app.post("/api/analyze-report")
async def analyze_report(file: UploadFile = File(...)):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY fehlt.")

    if file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(status_code=400, detail="Bitte eine PDF-Datei hochladen.")

    try:
        pdf_bytes = await file.read()
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Leere Datei.")

        data_url = encode_pdf_to_data_url_bytes(pdf_bytes)
        result = query_model_with_pdf_for_score_and_swot(
            pdf_source=data_url,
            filename=file.filename or "lagebericht.pdf",
        )
        return JSONResponse(content=result)

    except Exception as e:
        logger.exception("Fehler")
        raise HTTPException(status_code=500, detail=f"Interner Fehler: {e}")

# ============================================================
# ==================   PDF EXPORT ENDPOINT   =================
# ============================================================
@app.post("/api/report-pdf")
def generate_report_pdf(result: AnalysisResultModel):
    try:
        pdf_bytes = render_pdf_sync(result.dict())
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="CreditRisk_Report.pdf"'
            }
        )
    except Exception as e:
        logger.exception("Fehler beim PDF-Rendering")
        raise HTTPException(status_code=500, detail=f"PDF-Rendering fehlgeschlagen: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)

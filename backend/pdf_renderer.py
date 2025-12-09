# pdf_renderer.py
import asyncio
from pathlib import Path
from typing import Dict, Any, List

from playwright.async_api import async_playwright

# report.css liegt im gleichen Ordner wie app.py & dieses File
REPORT_CSS_PATH = Path(__file__).parent / "report.css"


def map_score_to_category(score: float) -> int:
    rounded = round(score)
    clamped = max(0, min(10, rounded))
    if clamped <= 2:
        return 1
    if clamped == 3:
        return 2
    if clamped == 4:
        return 3
    if clamped <= 6:
        return 4
    return 5


def _render_list(items: List[str]) -> str:
    if not items:
        return '<p class="swot-empty">Keine Punkte erkannt.</p>'
    lis = "".join(f"<li>{i}</li>" for i in items)
    return f'<ul class="swot-list">{lis}</ul>'


def build_report_html(data: Dict[str, Any]) -> str:
    """
    Baut eine eigenständige HTML-Seite mit demselben Layout wie im Frontend.
    Wir verwenden dieselben CSS-Klassen aus report.css.
    """
    css = ""
    if REPORT_CSS_PATH.exists():
        css = REPORT_CSS_PATH.read_text(encoding="utf-8")

    company_name = data.get("company_name") or "–"
    fiscal_year = data.get("company_fiscal_year") or "–"
    overall = data.get("overall_risk_assessment_text") or ""
    score = data.get("risk_score_0_to_10") or 0
    key_drivers = data.get("key_downgrade_drivers") or []
    swot = data.get("swot") or {}
    strengths = swot.get("strengths") or []
    weaknesses = swot.get("weaknesses") or []
    opportunities = swot.get("opportunities") or []
    threats = swot.get("threats") or []

    category = map_score_to_category(score)
    marker_pos_percent = ((category - 1) / 4) * 100

    def list_html(items: List[str]) -> str:
        return _render_list(items)

    html = f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Business Risk Report</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background: #e5e7eb;
    }}
    {css}
  </style>
</head>
<body>

  <!-- Seite 1 -->
  <div class="report-a4">
    <div class="report-inner text-[11px]">
      <header class="flex items-start justify-between mb-2">
        <div>
          <h2 class="report-title">Business Risk Report</h2>
          <div class="mb-1 flex items-center">
            <span class="report-company-label">Unternehmen:</span>
            <span class="report-company-name">{company_name}</span>
          </div>
          <div class="flex items-center">
            <span class="report-fy-label">Geschäftsjahr:</span>
            <span class="report-fy-value">{fiscal_year}</span>
          </div>
        </div>
        <div class="report-brand">CreditTrend&nbsp;AI</div>
      </header>

      <section class="mt-2">
        <h3 class="report-section-title mb-2">Credit-Deterioration-Analyse</h3>

        <div class="report-panel">
          <div class="mb-4">
            <p class="report-body-text font-semibold mb-2">
              Downgrade-Risikokategorie (1–5)
            </p>

            <!-- RiskScoreCard -->
            <div class="space-y-3">
              <div class="flex items-baseline justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-3xl font-semibold text-slate-900">{category}</span>
                  <span class="text-xs text-slate-500">/ 5</span>
                </div>
              </div>

              <div class="mt-1">
                <div class="relative w-full">
                  <div class="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full w-full rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500"></div>
                  </div>
                  <div
                    class="absolute top-[-3px] h-4 w-[2px] bg-slate-900"
                    style="left: calc({marker_pos_percent}% - 1px);"
                  ></div>
                </div>
                <div class="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                </div>
              </div>
            </div>
          </div>

          <div class="mb-4">
            <p class="report-body-text whitespace-pre-line">{overall}</p>
          </div>

          <div>
            <p class="report-body-text font-semibold mb-1">
              Potentielle Downgrade-Treiber
            </p>
            <ul class="report-list list-disc list-outside space-y-1">
              {''.join(f'<li>{d}</li>' for d in key_drivers)}
            </ul>
          </div>
        </div>
      </section>
    </div>
  </div>

  <!-- Seite 2: Stärken & Schwächen -->
  <div class="report-a4">
    <div class="report-inner text-[11px]">
      <header class="flex items-start justify-between mb-2">
        <div>
          <h2 class="report-title">Business Risk Report</h2>
          <div class="mb-1 flex items-center">
            <span class="report-company-label">Unternehmen:</span>
            <span class="report-company-name">{company_name}</span>
          </div>
          <div class="flex items-center">
            <span class="report-fy-label">Geschäftsjahr:</span>
            <span class="report-fy-value">{fiscal_year}</span>
          </div>
        </div>
        <div class="report-brand">CreditTrend&nbsp;AI</div>
      </header>

      <section class="mt-2">
        <h3 class="report-section-title mb-3">
          SWOT-Analyse Business Risk – Teil 1
        </h3>

        <div class="swot-grid">
          <div class="swot-card">
            <div class="swot-card-title swot-title--strengths">Stärken</div>
            <div class="swot-card-body">
              {list_html(strengths)}
            </div>
          </div>

          <div class="swot-card">
            <div class="swot-card-title swot-title--weaknesses">Schwächen</div>
            <div class="swot-card-body">
              {list_html(weaknesses)}
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <!-- Seite 3: Chancen & Risiken -->
  <div class="report-a4">
    <div class="report-inner text-[11px]">
      <header class="flex items-start justify-between mb-2">
        <div>
          <h2 class="report-title">Business Risk Report</h2>
          <div class="mb-1 flex items-center">
            <span class="report-company-label">Unternehmen:</span>
            <span class="report-company-name">{company_name}</span>
          </div>
          <div class="flex items-center">
            <span class="report-fy-label">Geschäftsjahr:</span>
            <span class="report-fy-value">{fiscal_year}</span>
          </div>
        </div>
        <div class="report-brand">CreditTrend&nbsp;AI</div>
      </header>

      <section class="mt-2">
        <h3 class="report-section-title mb-3">
          SWOT-Analyse Business Risk – Teil 2
        </h3>

        <div class="swot-grid">
          <div class="swot-card">
            <div class="swot-card-title swot-title--opportunities">Chancen</div>
            <div class="swot-card-body">
              {list_html(opportunities)}
            </div>
          </div>

          <div class="swot-card">
            <div class="swot-card-title swot-title--threats">Risiken</div>
            <div class="swot-card-body">
              {list_html(threats)}
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

</body>
</html>
"""
    return html


async def render_pdf_from_data(data: Dict[str, Any]) -> bytes:
    html = build_report_html(data)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(html, wait_until="networkidle")

        pdf_bytes = await page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )
        await browser.close()
        return pdf_bytes


def render_pdf_sync(data: Dict[str, Any]) -> bytes:
    """
    Sync-Wrapper für FastAPI, damit wir die async-Funktion einfach aufrufen können.
    """
    return asyncio.run(render_pdf_from_data(data))

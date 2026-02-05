import React, { useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import "./report.css";

type SWOT = {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
};

type AnalysisResult = {
  model_version: string;
  company_name: string;
  company_fiscal_year: string;
  risk_score_0_to_10: number;
  overall_risk_assessment_text: string;
  key_downgrade_drivers: string[];
  swot: SWOT;
};

// =======================
// Mapping 0–10 -> 1–5
// =======================
const mapScoreToCategory = (score: number): number => {
  const rounded = Math.round(score);
  const clamped = Math.min(10, Math.max(0, rounded));

  if (clamped <= 2) return 1; // gering
  if (clamped === 3) return 2; // moderat
  if (clamped === 4) return 3; // erhöht
  if (clamped <= 6) return 4; // hoch (5-6)
  return 5; // sehr hoch (7-10)
};

const categoryToLabel = (category: number): string => {
  switch (category) {
    case 1:
      return "gering";
    case 2:
      return "moderat";
    case 3:
      return "erhöht";
    case 4:
      return "hoch";
    case 5:
    default:
      return "sehr hoch";
  }
};

// =======================
// Farbinterpolation passend zur Skala (grün -> amber -> rot)
// =======================
const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (x: number) => x.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpColor = (c1: string, c2: string, t: number) => {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  return rgbToHex(
    Math.round(lerp(a.r, b.r, t)),
    Math.round(lerp(a.g, b.g, t)),
    Math.round(lerp(a.b, b.b, t))
  );
};

// Tailwind-ähnliche Basisfarben (500er)
const GREEN_500 = "#22c55e";
const AMBER_500 = "#f59e0b";
const RED_500 = "#ef4444";

const getScaleColorForCategory = (category: number) => {
  const c = Math.min(5, Math.max(1, category));
  const percent = ((c - 1) / 4) * 100;

  // 0..50: grün->amber, 50..100: amber->rot
  if (percent <= 50) {
    const t = percent / 50;
    return lerpColor(GREEN_500, AMBER_500, t);
  } else {
    const t = (percent - 50) / 50;
    return lerpColor(AMBER_500, RED_500, t);
  }
};

// =======================
// Komponente: Risikoscore 1–5 mit Marker + verbale Einschätzung
// =======================
const RiskScoreCard: React.FC<{ result: AnalysisResult }> = ({ result }) => {
  const rawScore = result.risk_score_0_to_10 ?? 0;
  const category = mapScoreToCategory(rawScore);

  // Marker-Position exakt auf der Zahl: 1 → 0%, 2 → 25%, 3 → 50%, 4 → 75%, 5 → 100%
  const markerPositionPercent = ((category - 1) / 4) * 100;

  const label = categoryToLabel(category);
  const badgeColor = getScaleColorForCategory(category);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-slate-900">
            {category}
          </span>
          <span className="text-xs text-slate-500">/ 5</span>
        </div>

        {/* Verbale Risikoeinschätzung (Farbe passend zur Skala) */}
        <div
          className="px-5 py-2 rounded-xl text-white font-semibold text-sm shadow-sm whitespace-nowrap"
          style={{ backgroundColor: badgeColor }}
          aria-label={`Risiko: ${label}`}
          title={`Risiko: ${label}`}
        >
          Risiko: {label}
        </div>
      </div>

      {/* Balkenanzeige 1–5 mit vollem Gradient + Marker-Strich */}
      <div className="mt-1">
        <div className="relative w-full">
          {/* Vollbreite-Gradient */}
          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500" />
          </div>
          {/* Marker */}
          <div
            className="absolute top-[-3px] h-4 w-[2px] bg-slate-900"
            style={{ left: `calc(${markerPositionPercent}% - 1px)` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

// =======================
// SWOT-Grid (zeigt einfach nur, was man ihm gibt)
// =======================
const SWOTGrid: React.FC<{ swot: SWOT }> = ({ swot }) => {
  const renderList = (items: string[] | undefined) => {
    const safeItems = items || [];

    return safeItems.length ? (
      <ul className="swot-list">
        {safeItems.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    ) : (
      <p className="swot-empty">Keine Punkte erkannt.</p>
    );
  };

  return (
    <div className="swot-grid">
      {/* Stärken */}
      <div className="swot-card">
        <div className="swot-card-title swot-title--strengths">Stärken</div>
        <div className="swot-card-body">{renderList(swot.strengths)}</div>
      </div>

      {/* Schwächen */}
      <div className="swot-card">
        <div className="swot-card-title swot-title--weaknesses">Schwächen</div>
        <div className="swot-card-body">{renderList(swot.weaknesses)}</div>
      </div>

      {/* Chancen */}
      <div className="swot-card">
        <div className="swot-card-title swot-title--opportunities">
          Chancen
        </div>
        <div className="swot-card-body">{renderList(swot.opportunities)}</div>
      </div>

      {/* Risiken */}
      <div className="swot-card">
        <div className="swot-card-title swot-title--threats">Risiken</div>
        <div className="swot-card-body">{renderList(swot.threats)}</div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A4-Seiten für PDF-Export
  const page1Ref = useRef<HTMLDivElement | null>(null);
  const page2Ref = useRef<HTMLDivElement | null>(null);
  const page3Ref = useRef<HTMLDivElement | null>(null);

  // Flag: braucht SWOT eine dritte Seite (Chancen & Risiken)?
  const [needsThirdPage, setNeedsThirdPage] = useState(false);

  const handleFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (f.type !== "application/pdf") {
      setError("Bitte eine PDF-Datei hochladen.");
      return;
    }
    setError(null);
    setFile(f);
    setResult(null);
    setNeedsThirdPage(false);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setNeedsThirdPage(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        "https://credit-risk-app-nqow.onrender.com/api/analyze-report",
        {
          method: "POST",
          body: formData,
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Fehler bei der Analyse.");
      }
      const data = (await res.json()) as AnalysisResult;
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  };

  // Nach dem Rendern von Seite 2 prüfen wir, ob die SWOT-Seite überläuft.
  useEffect(() => {
    if (!result) {
      setNeedsThirdPage(false);
      return;
    }
    if (!page2Ref.current) return;
    if (needsThirdPage) return; // bereits gesplittet, nicht erneut prüfen

    const el = page2Ref.current;
    const hasOverflow = el.scrollHeight > el.clientHeight + 1;

    if (hasOverflow) {
      setNeedsThirdPage(true);
    }
  }, [result, needsThirdPage]);

  const handleExportPdf = async () => {
    if (!result || !page1Ref.current || !page2Ref.current) {
      return;
    }

    try {
      // Sicherstellen, dass Webfonts geladen sind, bevor wir Screenshots machen
      if ((document as any).fonts && (document as any).fonts.ready) {
        await (document as any).fonts.ready;
      }

      // Seite 1 zuerst rendern, um Format für das PDF zu bestimmen
      const canvas1 = await html2canvas(page1Ref.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData1 = canvas1.toDataURL("image/png");

      // PDF exakt in Canvas-Pixelgröße anlegen → 1:1 wie im Browser
      const pdf = new jsPDF({
        orientation: canvas1.width > canvas1.height ? "l" : "p",
        unit: "px",
        format: [canvas1.width, canvas1.height],
      });

      pdf.addImage(imgData1, "PNG", 0, 0, canvas1.width, canvas1.height);

      // Seite 2
      {
        const canvas2 = await html2canvas(page2Ref.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        const imgData2 = canvas2.toDataURL("image/png");
        pdf.addPage();
        pdf.addImage(imgData2, "PNG", 0, 0, canvas2.width, canvas2.height);
      }

      // Seite 3 (nur Chancen & Risiken), nur wenn vorhanden
      if (page3Ref.current) {
        const canvas3 = await html2canvas(page3Ref.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        const imgData3 = canvas3.toDataURL("image/png");
        pdf.addPage();
        pdf.addImage(imgData3, "PNG", 0, 0, canvas3.width, canvas3.height);
      }

      const filename = `CreditRisk_Report_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error("Fehler beim PDF-Export:", err);
      alert("Beim PDF-Export ist ein Fehler aufgetreten.");
    }
  };

  // Sicheres SWOT-Objekt
  const safeSwot: SWOT = result?.swot || {
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
  };

  // Wenn eine dritte Seite nötig ist:
  // Seite 2 → Stärken & Schwächen
  // Seite 3 → Chancen & Risiken
  const swotForPage2: SWOT = needsThirdPage
    ? {
        strengths: safeSwot.strengths,
        weaknesses: safeSwot.weaknesses,
        opportunities: [],
        threats: [],
      }
    : safeSwot;

  const swotForPage3: SWOT | null = needsThirdPage
    ? {
        strengths: [],
        weaknesses: [],
        opportunities: safeSwot.opportunities,
        threats: safeSwot.threats,
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              CreditRisk AI
            </h1>
            <p className="text-sm text-slate-500">
              Automatisierte Risikoanalyse von Lageberichten für
              Kreditentscheidungen
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Upload Card */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Lagebericht hochladen
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Laden Sie einen Lagebericht (PDF-Datei) hoch und erhalten Sie
            innerhalb weniger Sekunden eine automatische Risikoanalyse für ein
            Rating-Downgrade sowie eine SWOT-Analyse zum Business Risk.
          </p>

          <div
            className="mt-2 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-slate-100 transition cursor-pointer p-6 flex flex-col items-center justify-center text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files);
            }}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <svg
              className="w-10 h-10 mb-3 text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.6}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 15.75 7.5 11.25 12 15.75 16.5 11.25 21 15.75M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v12.75A1.5 1.5 0 0 1 19.5 20.25h-15A1.5 1.5 0 0 1 3 18.75V6A1.5 1.5 0 0 1 4.5 4.5z"
              />
            </svg>
            <p className="font-medium text-slate-800">
              PDF hier ablegen oder klicken
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Unterstützt wird eine einzelne PDF-Datei (Lagebericht).
            </p>
            <input
              id="file-input"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files)}
            />
            {file && (
              <p className="mt-3 text-xs text-slate-600">
                Ausgewählt: <span className="font-semibold">{file.name}</span>
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? "Analyse läuft..." : "Analyse starten"}
            </button>
            {error && (
              <p className="text-xs text-red-600 max-w-sm text-right">
                {error}
              </p>
            )}
          </div>
        </section>

        {/* Ergebnisbereich + PDF-Button */}
        {result && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={handleExportPdf}
                className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-sm"
              >
                Als PDF exportieren
              </button>
            </div>

            {/* Seite 1: Score + verbale Einschätzung + Downgrade-Treiber */}
            <div className="flex justify-center">
              <div ref={page1Ref} className="report-a4">
                <div className="report-inner text-[11px]">
                  {/* Kopfbereich */}
                  <header className="flex items-start justify-between mb-2">
                    <div>
                      <h2 className="report-title">Business Risk Report</h2>

                      <div className="mb-1 flex items-center">
                        <span className="report-company-label">
                          Unternehmen:
                        </span>
                        <span className="report-company-name">
                          {result.company_name || "–"}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="report-fy-label">Geschäftsjahr:</span>
                        <span className="report-fy-value">
                          {result.company_fiscal_year || "–"}
                        </span>
                      </div>
                    </div>

                    <div className="report-brand">CreditTrend&nbsp;AI</div>
                  </header>

                  {/* Credit-Deterioration-Analyse */}
                  <section className="mt-2">
                    <h3 className="report-section-title mb-2">
                      Credit-Deterioration-Analyse
                    </h3>

                    <div className="report-panel">
                      {/* Score */}
                      <div className="mb-4">
                        <p className="report-body-text font-semibold mb-2">
                          Downgrade-Risikokategorie (1–5)
                        </p>
                        <RiskScoreCard result={result} />
                      </div>

                      {/* Verbale Gesamteinschätzung */}
                      <div className="mb-4">
                        <p className="report-body-text whitespace-pre-line">
                          {result.overall_risk_assessment_text}
                        </p>
                      </div>

                      {/* Downgrade-Treiber */}
                      <div>
                        <p className="report-body-text font-semibold mb-1">
                          Potentielle Downgrade-Treiber
                        </p>
                        <ul className="report-list list-disc list-outside space-y-1">
                          {(result.key_downgrade_drivers || []).map(
                            (item, idx) => (
                              <li key={idx}>{item}</li>
                            )
                          )}
                        </ul>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>

            {/* Seite 2: SWOT-Analyse (ggf. nur Stärken & Schwächen) */}
            <div className="flex justify-center mt-8">
              <div ref={page2Ref} className="report-a4">
                <div className="report-inner text-[11px]">
                  {/* Kopfbereich */}
                  <header className="flex items-start justify-between mb-2">
                    <div>
                      <h2 className="report-title">Business Risk Report</h2>

                      <div className="mb-1 flex items-center">
                        <span className="report-company-label">
                          Unternehmen:
                        </span>
                        <span className="report-company-name">
                          {result.company_name || "–"}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="report-fy-label">Geschäftsjahr:</span>
                        <span className="report-fy-value">
                          {result.company_fiscal_year || "–"}
                        </span>
                      </div>
                    </div>

                    <div className="report-brand">CreditTrend&nbsp;AI</div>
                  </header>

                  {/* SWOT-Analyse (Seite 2) */}
                  <section className="mt-2">
                    <h3 className="report-section-title mb-3">
                      SWOT-Analyse Business Risk
                      {needsThirdPage ? " – Teil 1" : ""}
                    </h3>
                    <SWOTGrid swot={swotForPage2} />
                  </section>
                </div>
              </div>
            </div>

            {/* Seite 3: nur Chancen & Risiken, falls nötig */}
            {needsThirdPage && swotForPage3 && (
              <div className="flex justify-center mt-8">
                <div ref={page3Ref} className="report-a4">
                  <div className="report-inner text-[11px]">
                    {/* Kopfbereich */}
                    <header className="flex items-start justify-between mb-2">
                      <div>
                        <h2 className="report-title">Business Risk Report</h2>

                        <div className="mb-1 flex items-center">
                          <span className="report-company-label">
                            Unternehmen:
                          </span>
                          <span className="report-company-name">
                            {result.company_name || "–"}
                          </span>
                        </div>

                        <div className="flex items-center">
                          <span className="report-fy-label">
                            Geschäftsjahr:
                          </span>
                          <span className="report-fy-value">
                            {result.company_fiscal_year || "–"}
                          </span>
                        </div>
                      </div>

                      <div className="report-brand">CreditTrend&nbsp;AI</div>
                    </header>

                    {/* SWOT-Analyse (Seite 3 – Chancen & Risiken) */}
                    <section className="mt-2">
                      <h3 className="report-section-title mb-3">
                        SWOT-Analyse Business Risk – Teil 2
                      </h3>
                      <SWOTGrid swot={swotForPage3} />
                    </section>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
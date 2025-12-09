import React, { useState, useRef } from "react";
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

// =======================
// Komponente: Risikoscore 1–5
// =======================
const RiskScoreCard: React.FC<{ result: AnalysisResult }> = ({ result }) => {
  const rawScore = result.risk_score_0_to_10 ?? 0;
  const category = mapScoreToCategory(rawScore);

  // Marker-Position exakt auf der Zahl: 1 → 0%, 2 → 25%, 3 → 50%, 4 → 75%, 5 → 100%
  const markerPositionPercent = ((category - 1) / 4) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-semibold text-slate-900">
            {category}
          </span>
          <span className="text-xs text-slate-500">/ 5</span>
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
// SWOT-Grid (Seite 2)
// =======================
const SWOTGrid: React.FC<{ swot: SWOT }> = ({ swot }) => {
  const renderList = (items: string[]) =>
    items && items.length ? (
      <ul className="swot-list">
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    ) : (
      <p className="swot-empty">Keine Punkte erkannt.</p>
    );

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

  // Zwei A4-Seiten für PDF-Export
  const page1Ref = useRef<HTMLDivElement | null>(null);
  const page2Ref = useRef<HTMLDivElement | null>(null);

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
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

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

  const handleExportPdf = async () => {
    if (!result || !page1Ref.current || !page2Ref.current) {
      return;
    }

    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Seite 1
      {
        const canvas1 = await html2canvas(page1Ref.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        const imgData1 = canvas1.toDataURL("image/png");
        pdf.addImage(imgData1, "PNG", 0, 0, pageWidth, pageHeight);
      }

      // Seite 2
      {
        const canvas2 = await html2canvas(page2Ref.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        const imgData2 = canvas2.toDataURL("image/png");
        pdf.addPage();
        pdf.addImage(imgData2, "PNG", 0, 0, pageWidth, pageHeight);
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

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              CreditTrend AI
            </h1>
            <p className="text-sm text-slate-500">
              Qualitative Kreditrisikoanalyse von Lageberichten mit Fokus auf
              Business Risk.
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
            Ziehe eine PDF-Datei hierher oder klicke in das Feld, um einen
            Lagebericht auszuwählen. Anschließend wird ein Risikoscore für ein
            mögliches Rating-Downgrade ermittelt, der in eine Risiko-Kategorie
            von 1–5 übertragen wird, sowie eine qualitative SWOT-Analyse des
            Business Risk erstellt.
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
                  <header className="flex items-start justify-between mb-4">
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
                  <section className="mt-4">
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
                        <ul className="report-list list-disc list-outside pl-4 space-y-1">
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

            {/* Seite 2: SWOT-Analyse */}
            <div className="flex justify-center mt-8">
              <div ref={page2Ref} className="report-a4">
                <div className="report-inner text-[11px]">
                  {/* Kopfbereich (wiederholt) */}
                  <header className="flex items-start justify-between mb-4">
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

                  {/* SWOT-Analyse */}
                  <section className="mt-4">
                    <h3 className="report-section-title mb-3">
                      SWOT-Analyse Business Risk
                    </h3>
                    <SWOTGrid
                      swot={
                        result.swot || {
                          strengths: [],
                          weaknesses: [],
                          opportunities: [],
                          threats: [],
                        }
                      }
                    />
                  </section>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;
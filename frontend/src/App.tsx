import "./report.css";
import React, { useState } from "react";

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

  if (clamped <= 2) return 1;
  if (clamped === 3) return 2;
  if (clamped === 4) return 3;
  if (clamped <= 6) return 4;
  return 5;
};

const RiskScoreCard: React.FC<{ result: AnalysisResult }> = ({ result }) => {
  const category = mapScoreToCategory(result.risk_score_0_to_10);
  const markerPosPercent = ((category - 1) / 4) * 100;

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

      <div className="mt-1">
        <div className="relative w-full">
          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500"></div>
          </div>

          <div
            className="absolute top-[-3px] h-4 w-[2px] bg-slate-900"
            style={{ left: `calc(${markerPosPercent}% - 1px)` }}
          ></div>
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

const SWOTGrid: React.FC<{ swot: SWOT }> = ({ swot }) => {
  const renderList = (items: string[]) =>
    items?.length ? (
      <ul className="swot-list">{items.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
    ) : (
      <p className="swot-empty">Keine Punkte erkannt.</p>
    );

  return (
    <div className="swot-grid">
      <div className="swot-card">
        <div className="swot-card-title swot-title--strengths">Stärken</div>
        <div className="swot-card-body">{renderList(swot.strengths)}</div>
      </div>

      <div className="swot-card">
        <div className="swot-card-title swot-title--weaknesses">Schwächen</div>
        <div className="swot-card-body">{renderList(swot.weaknesses)}</div>
      </div>

      <div className="swot-card">
        <div className="swot-card-title swot-title--opportunities">Chancen</div>
        <div className="swot-card-body">{renderList(swot.opportunities)}</div>
      </div>

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
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!result) return;

    try {
      const res = await fetch(
        "https://credit-risk-app-nqow.onrender.com/api/report-pdf",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(result),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Fehler beim PDF-Export.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `CreditRisk_Report_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Fehler beim PDF-Export.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-slate-900">
            CreditTrend AI
          </h1>
          <p className="text-sm text-slate-500">
            Qualitative Kreditrisikoanalyse von Lageberichten
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Upload */}
        <section className="bg-white rounded-2xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-2">Lagebericht hochladen</h2>
          <p className="text-sm text-slate-500 mb-4">
            PDF hochladen → KI analysiert → Report generieren lassen.
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
            <svg className="w-10 h-10 mb-3 text-blue-500" viewBox="0 0 24 24">
              <path
                stroke="currentColor"
                strokeWidth="1.6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 15.75 7.5 11.25 12 15.75 16.5 11.25 21 15.75M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v12.75A1.5 1.5 0 0 1 19.5 20.25h-15A1.5 1.5 0 0 1 3 18.75V6A1.5 1.5 0 0 1 4.5 4.5z"
              />
            </svg>

            <p className="font-medium text-slate-800">
              PDF hier ablegen oder klicken
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Unterstützt: eine PDF-Datei
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

          <div className="mt-4 flex justify-between items-center">
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm shadow-sm disabled:opacity-50"
            >
              {loading ? "Analyse läuft…" : "Analyse starten"}
            </button>

            {error && (
              <p className="text-xs text-red-600 text-right">{error}</p>
            )}
          </div>
        </section>

        {/* RESULTS */}
        {result && (
          <>
            <div className="flex justify-end">
              <button
                onClick={handleExportPdf}
                className="px-4 py-2 rounded-xl text-sm bg-white border shadow-sm"
              >
                Als PDF exportieren
              </button>
            </div>

            {/* Preview */}
            <div className="flex justify-center">
              <div className="report-a4">
                <div className="report-inner text-[11px]">

                  <header className="flex items-start justify-between mb-2">
                    <div>
                      <h2 className="report-title">Business Risk Report</h2>

                      <div className="flex items-center mb-1">
                        <span className="report-company-label">Unternehmen:</span>
                        <span className="report-company-name">
                          {result.company_name}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="report-fy-label">Geschäftsjahr:</span>
                        <span className="report-fy-value">
                          {result.company_fiscal_year}
                        </span>
                      </div>
                    </div>

                    <div className="report-brand">CreditTrend&nbsp;AI</div>
                  </header>

                  <section className="mt-2">
                    <h3 className="report-section-title mb-2">
                      Credit-Deterioration-Analyse
                    </h3>

                    <div className="report-panel">

                      <p className="report-body-text font-semibold mb-2">
                        Downgrade-Risikokategorie (1–5)
                      </p>

                      <RiskScoreCard result={result} />

                      <p className="report-body-text mt-4 whitespace-pre-line">
                        {result.overall_risk_assessment_text}
                      </p>

                      <p className="report-body-text font-semibold mt-4 mb-1">
                        Potentielle Downgrade-Treiber
                      </p>

                      <ul className="report-list list-disc list-outside space-y-1">
                        {result.key_downgrade_drivers.map((d, idx) => (
                          <li key={idx}>{d}</li>
                        ))}
                      </ul>
                    </div>
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

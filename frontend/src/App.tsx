import React, { useState, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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

// Komponente für den Risikoscore (Balken + Ampel)
const RiskScoreCard: React.FC<{ result: AnalysisResult }> = ({ result }) => {
  const score = result.risk_score_0_to_10 ?? 0;
  const scoreRounded = Math.round(score);

  // Schwellen:
  // 0–3  -> geringes Risiko
  // 4–6  -> moderates Risiko
  // >=7  -> erhöhtes Risiko
  let level: "low" | "medium" | "high" = "low";
  if (score >= 7) level = "high";
  else if (score >= 4) level = "medium";

  const levelLabel =
    level === "low"
      ? "Geringes Downgrade-Risiko"
      : level === "medium"
      ? "Moderates Downgrade-Risiko"
      : "Erhöhtes Downgrade-Risiko";

  const levelColor =
    level === "low"
      ? "bg-green-500"
      : level === "medium"
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-semibold text-slate-900">
            {scoreRounded}
          </span>
          <span className="text-xs text-slate-500">/ 10</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white leading-none min-h-[20px] ${levelColor}`}
          >
            {levelLabel}
          </span>
        </div>
      </div>

      {/* Balkenanzeige */}
      <div className="mt-1">
        <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500"
            style={{ width: `${(score / 10) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>0</span>
          <span>5</span>
          <span>10</span>
        </div>
      </div>
    </div>
  );
};

// Komponente für SWOT-Grid
const SWOTGrid: React.FC<{ swot: SWOT }> = ({ swot }) => {
  const cellClass =
    "rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2";

  const renderList = (items: string[]) =>
    items && items.length ? (
      <ul className="list-disc list-outside pl-4 text-sm text-slate-600 space-y-1">
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-slate-400">Keine Punkte erkannt.</p>
    );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <div className={cellClass}>
        <h4 className="font-semibold text-emerald-700 text-[13px]">
          Stärken
        </h4>
        {renderList(swot.strengths)}
      </div>
      <div className={cellClass}>
        <h4 className="font-semibold text-rose-700 text-[13px]">
          Schwächen
        </h4>
        {renderList(swot.weaknesses)}
      </div>
      <div className={cellClass}>
        <h4 className="font-semibold text-sky-700 text-[13px]">
          Chancen
        </h4>
        {renderList(swot.opportunities)}
      </div>
      <div className={cellClass}>
        <h4 className="font-semibold text-amber-700 text-[13px]">
          Risiken
        </h4>
        {renderList(swot.threats)}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Result-Container inkl. Überschrift, damit sie auch im PDF ist
  const resultRef = useRef<HTMLDivElement | null>(null);

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
      setError(e.message || "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!result || !resultRef.current) {
      return;
    }

    try {
      const element = resultRef.current;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const marginTop = 10;

      if (imgHeight <= pageHeight - marginTop * 2) {
        pdf.addImage(imgData, "PNG", 10, marginTop, imgWidth, imgHeight);
      } else {
        let position = marginTop;
        let remainingHeight = imgHeight;

        while (remainingHeight > 0) {
          pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
          remainingHeight -= pageHeight;
          if (remainingHeight > 0) {
            pdf.addPage();
            position = marginTop;
          }
        }
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
            mögliches Rating-Downgrade sowie eine qualitative SWOT-Analyse des
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
            <div className="flex justify-end">
              <button
                onClick={handleExportPdf}
                className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-sm"
              >
                Als PDF exportieren
              </button>
            </div>

            {/* Dieser Container kommt vollständig in den PDF-Export */}
            <div ref={resultRef} className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">
                Business Risk Report
              </h2>
              <p className="text-sm text-slate-700">
                <span className="font-medium">Unternehmen:</span>{" "}
                {result.company_name || "–"}
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-medium">Geschäftsjahr:</span>{" "}
                {result.company_fiscal_year || "–"}
              </p>

              <section className="space-y-6">
                {/* Credit-Deterioration-Analyse (Score & verbale Einschätzung) */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-4">
                  <h3 className="text-md font-semibold text-slate-900">
                    Credit-Deterioration-Analyse
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-slate-800 mb-1">
                        Downgrade-Risikoscore (0–10)
                      </h4>
                      <RiskScoreCard result={result} />
                    </div>

                    <div>
                      <p className="text-sm text-slate-600">
                        {result.overall_risk_assessment_text}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-slate-800 mb-1">
                        Potentielle Downgrade-Treiber
                      </h4>
                      <ul className="list-disc list-outside pl-4 text-sm text-slate-600 space-y-1">
                        {result.key_downgrade_drivers.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* SWOT */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-md font-semibold text-slate-900 mb-3">
                    SWOT-Analyse Business Risk
                  </h3>
                  <SWOTGrid swot={result.swot} />
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;
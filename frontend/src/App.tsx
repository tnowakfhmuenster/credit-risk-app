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

// =======================
// Komponente: Risikoscore 1–5 mit Marker
// =======================
const RiskScoreCard: React.FC<{ result: AnalysisResult }> = ({ result }) => {
  const rawScore = result.risk_score_0_to_10 ?? 0;
  const category = mapScoreToCategory(rawScore);

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

      <div className="mt-1">
        <div className="relative w-full">
          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500" />
          </div>
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
// SWOT-Grid
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
      <div className="swot-card">
        <div className="swot-card-title swot-title--strengths">Stärken</div>
        <div className="swot-card-body">{renderList(swot.strengths)}</div>
      </div>

      <div className="swot-card">
        <div className="swot-card-title swot-title--weaknesses">Schwächen</div>
        <div className="swot-card-body">{renderList(swot.weaknesses)}</div>
      </div>

      <div className="swot-card">
        <div className="swot-card-title swot-title--opportunities">
          Chancen
        </div>
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

  const page1Ref = useRef<HTMLDivElement | null>(null);
  const page2Ref = useRef<HTMLDivElement | null>(null);
  const page3Ref = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!result) {
      setNeedsThirdPage(false);
      return;
    }
    if (!page2Ref.current || needsThirdPage) return;

    const el = page2Ref.current;
    const hasOverflow = el.scrollHeight > el.clientHeight + 1;

    if (hasOverflow) {
      setNeedsThirdPage(true);
    }
  }, [result, needsThirdPage]);

  const handleExportPdf = async () => {
    if (!result || !page1Ref.current || !page2Ref.current) return;

    try {
      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }

      const canvas1 = await html2canvas(page1Ref.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData1 = canvas1.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: canvas1.width > canvas1.height ? "l" : "p",
        unit: "px",
        format: [canvas1.width, canvas1.height],
      });

      pdf.addImage(imgData1, "PNG", 0, 0, canvas1.width, canvas1.height);

      const canvas2 = await html2canvas(page2Ref.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      pdf.addPage();
      pdf.addImage(
        canvas2.toDataURL("image/png"),
        "PNG",
        0,
        0,
        canvas2.width,
        canvas2.height
      );

      if (page3Ref.current) {
        const canvas3 = await html2canvas(page3Ref.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        pdf.addPage();
        pdf.addImage(
          canvas3.toDataURL("image/png"),
          "PNG",
          0,
          0,
          canvas3.width,
          canvas3.height
        );
      }

      pdf.save(
        `CreditRisk_Report_${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } catch (err) {
      console.error("Fehler beim PDF-Export:", err);
      alert("Beim PDF-Export ist ein Fehler aufgetreten.");
    }
  };

  const safeSwot: SWOT = result?.swot || {
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
  };

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

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
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
            <p className="font-medium text-slate-800">
              PDF hier ablegen oder klicken
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
              className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
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
      </main>
    </div>
  );
};

export default App;
"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

type Props = {
  projectId: number;
  pdfExists: boolean;
};

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>> extends { promise: Promise<infer T> }
  ? T
  : any;

const zoomOptions = [
  { label: "Fit width", value: "fit" },
  { label: "75%", value: "0.75" },
  { label: "100%", value: "1" },
  { label: "125%", value: "1.25" },
  { label: "150%", value: "1.5" },
  { label: "200%", value: "2" },
];

export default function PdfPreviewClient({ projectId, pdfExists }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);

  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [zoom, setZoom] = useState("fit");
  const [message, setMessage] = useState("");
  const [previewHeight, setPreviewHeight] = useState(720);

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  useEffect(() => {
    const fitToViewport = () => {
      setPreviewHeight((value) => {
        const preferred = Math.max(360, window.innerHeight - 230);
        return clamp(value || preferred, 300, Math.max(420, window.innerHeight - 120));
      });
    };

    fitToViewport();
    window.addEventListener("resize", fitToViewport);
    return () => window.removeEventListener("resize", fitToViewport);
  }, []);

  function startResizePreviewHeight(event: import("react").MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = previewHeight;

    const onMove = (moveEvent: MouseEvent) => {
      const dy = moveEvent.clientY - startY;
      setPreviewHeight(clamp(startHeight + dy, 300, Math.max(420, window.innerHeight - 80)));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      if (!pdfExists) {
        setPdf(null);
        return;
      }

      setMessage("Loading PDF...");

      try {
        const loadingTask = pdfjsLib.getDocument(`/api/projects/${projectId}/pdf?inline=1&ts=${Date.now()}`);
        const loadedPdf = await loadingTask.promise;

        if (!cancelled) {
          setPdf(loadedPdf);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setMessage("PDF preview failed to load.");
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [projectId, pdfExists]);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      const host = canvasHostRef.current;
      const container = containerRef.current;

      if (!host || !container || !pdf) return;

      host.innerHTML = "";
      setMessage("Rendering PDF...");

      try {
        const containerWidth = Math.max(280, container.clientWidth - 32);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });

          const scale =
            zoom === "fit"
              ? containerWidth / baseViewport.width
              : Number(zoom);

          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) continue;

          const deviceScale = window.devicePixelRatio || 1;

          canvas.width = Math.floor(viewport.width * deviceScale);
          canvas.height = Math.floor(viewport.height * deviceScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 14px auto";
          canvas.style.background = "white";
          canvas.style.boxShadow = "0 1px 5px rgba(15, 23, 42, 0.18)";

          context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

          host.appendChild(canvas);

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
          }).promise;
        }

        if (!cancelled) setMessage("");
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setMessage("PDF rendering failed.");
        }
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
    };
  }, [pdf, zoom]);

  if (!pdfExists) {
    return (
      <div className="fsx-empty-box" style={{ marginTop: 12 }}>
        PDF is not generated yet. Run Smart Compile first.
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 12,
          marginBottom: 10,
          alignItems: "center",
        }}
      >
        <span className="fsx-muted" style={{ fontWeight: 700, marginRight: 4 }}>
          Zoom
        </span>

        {zoomOptions.map((item) => (
          <button
            key={item.value}
            type="button"
            className={zoom === item.value ? "fsx-button fsx-button-primary" : "fsx-button"}
            onClick={() => setZoom(item.value)}
            style={{ padding: "6px 9px", fontSize: 12 }}
          >
            {item.label}
          </button>
        ))}

        <a
          href={`/api/projects/${projectId}/pdf?inline=1`}
          target="_blank"
          rel="noreferrer"
          className="fsx-button"
          style={{ padding: "6px 9px", fontSize: 12 }}
        >
          Open full viewer
        </a>

        <a
          href={`/api/projects/${projectId}/pdf`}
          className="fsx-button fsx-button-primary"
          style={{ padding: "6px 9px", fontSize: 12 }}
        >
          Download PDF
        </a>
      </div>

      {message ? (
        <div className="fsx-empty-box" style={{ marginBottom: 10 }}>
          {message}
        </div>
      ) : null}

      <div
        ref={containerRef}
        style={{
          height: `${previewHeight}px`,
          overflow: "auto",
          border: "1px solid #d1d5db",
          borderRadius: 16,
          background: "#e5e7eb",
          padding: 14,
        }}
      >
        <div ref={canvasHostRef} />
      </div>

      <div
        role="separator"
        aria-label="Resize PDF Preview height"
        title="Drag to resize PDF Preview height"
        onMouseDown={startResizePreviewHeight}
        style={{
          cursor: "row-resize",
          height: 12,
          borderRadius: 999,
          background: "linear-gradient(180deg, transparent, #cbd5e1, transparent)",
          margin: "8px 10px 0 10px",
        }}
      />
    </>
  );
}

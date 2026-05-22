"use client";

import { useEffect, useRef, useState } from "react";
type Props = {
  projectId: number;
  pdfExists: boolean;
  refreshKey?: number;
};

type PdfDoc = any;

type PdfScrollState = {
  pageNumber: number;
  offsetWithinPage: number;
  scrollRatio: number;
};

const zoomSteps = ["0.75", "1", "1.25", "1.5", "2"];
const zoomValues = ["fit", ...zoomSteps];

function zoomLabel(value: string) {
  if (value === "fit") return "Fit width";

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue * 100)}%` : value;
}

export default function PdfPreviewClient({ projectId, pdfExists, refreshKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);

  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [zoom, setZoom] = useState("fit");
  const [zoomPreferencesLoaded, setZoomPreferencesLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [previewHeight, setPreviewHeight] = useState(820);
  const [previewHeightPreferencesLoaded, setPreviewHeightPreferencesLoaded] = useState(false);

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function capturePdfScrollPosition(): PdfScrollState | null {
    const container = containerRef.current;
    const host = canvasHostRef.current;

    if (!container || !host) return null;

    const canvases = Array.from(
      host.querySelectorAll<HTMLCanvasElement>("canvas[data-page-number]")
    );

    if (canvases.length === 0) return null;

    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
    const scrollRatio = container.scrollTop / maxScroll;
    const containerTop = container.getBoundingClientRect().top;

    let targetCanvas = canvases[0];

    for (const canvas of canvases) {
      const rect = canvas.getBoundingClientRect();

      if (rect.bottom >= containerTop + 10) {
        targetCanvas = canvas;
        break;
      }
    }

    const pageNumber = Number(targetCanvas.dataset.pageNumber ?? "1") || 1;

    return {
      pageNumber,
      offsetWithinPage: container.scrollTop - targetCanvas.offsetTop,
      scrollRatio,
    };
  }

  function restorePdfScrollPosition(scrollState: PdfScrollState | null) {
    if (!scrollState) return;

    const container = containerRef.current;
    const host = canvasHostRef.current;

    if (!container || !host) return;

    const targetCanvas = host.querySelector<HTMLCanvasElement>(
      `canvas[data-page-number="${scrollState.pageNumber}"]`
    );

    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);

    if (targetCanvas) {
      container.scrollTop = clamp(
        targetCanvas.offsetTop + scrollState.offsetWithinPage,
        0,
        maxScroll
      );
      return;
    }

    container.scrollTop = clamp(scrollState.scrollRatio * maxScroll, 0, maxScroll);
  }

  useEffect(() => {
    try {
      const savedHeight = Number(window.localStorage.getItem("freeslotex.pdfPreviewHeight"));

      if (Number.isFinite(savedHeight)) {
        setPreviewHeight(clamp(savedHeight, 300, Math.max(420, window.innerHeight - 80)));
      }
    } catch {
      // Ignore storage errors. PDF preview still works with default height.
    } finally {
      setPreviewHeightPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!previewHeightPreferencesLoaded) return;

    try {
      window.localStorage.setItem("freeslotex.pdfPreviewHeight", String(previewHeight));
    } catch {
      // Ignore storage errors.
    }
  }, [previewHeightPreferencesLoaded, previewHeight]);

  useEffect(() => {
    try {
      const savedZoom = window.localStorage.getItem("freeslotex.pdfZoom");

      if (savedZoom && zoomValues.includes(savedZoom)) {
        setZoom(savedZoom);
      }
    } catch {
      // Ignore storage errors. PDF preview still works with Fit width.
    } finally {
      setZoomPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!zoomPreferencesLoaded) return;

    try {
      window.localStorage.setItem("freeslotex.pdfZoom", zoom);
    } catch {
      // Ignore storage errors.
    }
  }, [zoomPreferencesLoaded, zoom]);

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
        const pdfUrl = `/api/projects/${projectId}/pdf?inline=1&ts=${Date.now()}`;
        const response = await fetch(pdfUrl, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept: "application/pdf",
          },
        });

        const contentType = response.headers.get("content-type") ?? "";

        if (!response.ok) {
          throw new Error(`PDF request failed: HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (arrayBuffer.byteLength < 5) {
          throw new Error("PDF response was empty.");
        }

        const head = new TextDecoder("ascii").decode(new Uint8Array(arrayBuffer.slice(0, 5)));

        if (head !== "%PDF-") {
          const previewText = new TextDecoder("utf-8")
            .decode(new Uint8Array(arrayBuffer.slice(0, 180)))
            .replace(/\s+/g, " ")
            .trim();

          throw new Error(
            `PDF API did not return a PDF. Content-Type: ${contentType || "unknown"}. ${previewText}`
          );
        }

        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
        });

        const loadedPdf = await loadingTask.promise;

        if (!cancelled) {
          setPdf(loadedPdf);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          const detail = error instanceof Error ? error.message : String(error);
          setPdf(null);
          setMessage(`PDF preview failed to load. ${detail}`);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [projectId, pdfExists, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      const host = canvasHostRef.current;
      const container = containerRef.current;

      if (!host || !container || !pdf) return;

      const scrollState = capturePdfScrollPosition();

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

          canvas.dataset.pageNumber = String(pageNumber);

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

        if (!cancelled) {
          setMessage("");

          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              restorePdfScrollPosition(scrollState);
            });
          });
        }
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

  const currentZoomStepIndex = zoomSteps.indexOf(zoom);
  const effectiveZoomStepIndex =
    currentZoomStepIndex >= 0 ? currentZoomStepIndex : zoomSteps.indexOf("1");
  const canZoomOut = effectiveZoomStepIndex > 0;
  const canZoomIn = effectiveZoomStepIndex < zoomSteps.length - 1;

  function applyZoomDelta(delta: number) {
    const nextIndex = clamp(effectiveZoomStepIndex + delta, 0, zoomSteps.length - 1);
    setZoom(zoomSteps[nextIndex]);
  }

  const pdfToolbar = (
    <div className="fsx-pdf-toolbar" aria-label="PDF preview controls">
      <div className="fsx-pdf-title-line">
        <h2 className="fsx-panel-title">PDF Preview</h2>
        <p className="fsx-panel-note">Preview of the latest compiled PDF.</p>
      </div>

      <span className="fsx-muted" style={{ fontWeight: 700, marginRight: 4 }}>
        Zoom
      </span>

      <div className="fsx-pdf-zoom-group" aria-label="PDF zoom controls">
        <button
          type="button"
          className={zoom === "fit" ? "fsx-button fsx-button-primary" : "fsx-button"}
          onClick={() => setZoom("fit")}
          style={{ padding: "6px 9px", fontSize: 12 }}
        >
          Fit width
        </button>

        <button
          type="button"
          className="fsx-button fsx-pdf-zoom-step"
          onClick={() => applyZoomDelta(-1)}
          disabled={!canZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>

        <span className="fsx-pdf-zoom-value" aria-label={`Current zoom: ${zoomLabel(zoom)}`}>
          {zoomLabel(zoom)}
        </span>

        <button
          type="button"
          className="fsx-button fsx-pdf-zoom-step"
          onClick={() => applyZoomDelta(1)}
          disabled={!canZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
      </div>

      {pdfExists ? (
        <>
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
        </>
      ) : (
        <span className="fsx-button" aria-disabled="true" style={{ padding: "6px 9px", fontSize: 12 }}>
          PDF not generated yet
        </span>
      )}
    </div>
  );

  if (!pdfExists) {
    return (
      <>
        {pdfToolbar}
        <div className="fsx-empty-box" style={{ marginTop: 8 }}>
          PDF is not generated yet. Run Smart Compile first.
        </div>
      </>
    );
  }

  return (
    <>
      {pdfToolbar}

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

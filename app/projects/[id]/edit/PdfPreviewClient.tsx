"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
type Props = {
  projectId: number;
  pdfExists: boolean;
  pdfFile?: string;
  refreshKey?: number;
  toolbarPrefix?: ReactNode;
};

type PdfDoc = any;

type PdfScrollState = {
  pageNumber: number;
  offsetWithinPage: number;
  scrollRatio: number;
};

const zoomSteps = ["0.5", "0.75", "1", "1.25", "1.5", "2"];
const zoomValues = ["fit", ...zoomSteps];

function zoomLabel(value: string) {
  if (value === "fit") return "Fit";

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue * 100)}%` : value;
}

export default function PdfPreviewClient({ projectId, pdfExists, pdfFile = "main.pdf", refreshKey = 0, toolbarPrefix }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);

  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [zoom, setZoom] = useState("fit");
  const [zoomPreferencesLoaded, setZoomPreferencesLoaded] = useState(false);
  const [textSelectionEnabled, setTextSelectionEnabled] = useState(false);
  const [textSelectionPreferencesLoaded, setTextSelectionPreferencesLoaded] = useState(false);
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

    const pages = Array.from(
      host.querySelectorAll<HTMLDivElement>("[data-pdf-page-number]")
    );

    if (pages.length === 0) return null;

    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
    const scrollRatio = container.scrollTop / maxScroll;
    const containerTop = container.getBoundingClientRect().top;

    let targetPage = pages[0];

    for (const page of pages) {
      const rect = page.getBoundingClientRect();

      if (rect.bottom >= containerTop + 10) {
        targetPage = page;
        break;
      }
    }

    const pageNumber =
      Number(targetPage.dataset.pdfPageNumber ?? "1") || 1;

    return {
      pageNumber,
      offsetWithinPage: container.scrollTop - targetPage.offsetTop,
      scrollRatio,
    };
  }

  function restorePdfScrollPosition(scrollState: PdfScrollState | null) {
    if (!scrollState) return;

    const container = containerRef.current;
    const host = canvasHostRef.current;

    if (!container || !host) return;

    const targetPage = host.querySelector<HTMLDivElement>(
      `[data-pdf-page-number="${scrollState.pageNumber}"]`
    );

    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);

    if (targetPage) {
      container.scrollTop = clamp(
        targetPage.offsetTop + scrollState.offsetWithinPage,
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
        setPreviewHeight(clamp(savedHeight, 300, Math.max(1200, window.innerHeight * 1.6)));
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
    try {
      const savedTextSelection = window.localStorage.getItem(
        "freeslotex.pdfTextSelection"
      );

      if (savedTextSelection === "0") {
        setTextSelectionEnabled(false);
      } else if (savedTextSelection === "1") {
        setTextSelectionEnabled(true);
      }
    } catch {
      // Keep selectable PDF text disabled by default.
    } finally {
      setTextSelectionPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!textSelectionPreferencesLoaded) return;

    try {
      window.localStorage.setItem(
        "freeslotex.pdfTextSelection",
        textSelectionEnabled ? "1" : "0"
      );
    } catch {
      // Ignore storage errors.
    }
  }, [textSelectionEnabled, textSelectionPreferencesLoaded]);

  useEffect(() => {
    const fitToViewport = () => {
      setPreviewHeight((value) => {
        const preferred = Math.max(360, window.innerHeight - 230);
        return clamp(value || preferred, 300, Math.max(1200, window.innerHeight * 1.6));
      });
    };

    fitToViewport();
    window.addEventListener("resize", fitToViewport);
    return () => window.removeEventListener("resize", fitToViewport);
  }, []);

  function startResizePreviewHeight(event: import("react").PointerEvent<HTMLDivElement>) {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = previewHeight;

    const onMove = (moveEvent: PointerEvent) => {
      const dy = moveEvent.clientY - startY;
      setPreviewHeight(clamp(startHeight + dy, 300, Math.max(1200, window.innerHeight * 1.6)));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const encodedPdfFile = encodeURIComponent(pdfFile);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      if (!pdfExists) {
        setPdf(null);
        return;
      }

      setMessage("Loading PDF...");

      try {
        const pdfUrl = `/api/projects/${projectId}/pdf?inline=1&file=${encodedPdfFile}&ts=${Date.now()}`;
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
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          useSystemFonts: true,
          disableFontFace: false,
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
    if (!textSelectionPreferencesLoaded) return;

    let cancelled = false;
    const textLayers: Array<{ cancel: () => void }> = [];

    async function renderPdf() {
      const host = canvasHostRef.current;
      const container = containerRef.current;

      if (!host || !container || !pdf) return;

      const scrollState = capturePdfScrollPosition();

      host.innerHTML = "";
      setMessage("Rendering PDF...");

      try {
        const pdfjsLib = await import("pdfjs-dist");
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
          const pageWrapper = document.createElement("div");
          const canvas = document.createElement("canvas");
          const textLayerDiv = document.createElement("div");
          const context = canvas.getContext("2d");

          if (!context) continue;

          pageWrapper.className = "fsx-pdf-page";
          pageWrapper.dataset.pdfPageNumber = String(pageNumber);
          pageWrapper.style.position = "relative";
          pageWrapper.style.width = `${viewport.width}px`;
          pageWrapper.style.height = `${viewport.height}px`;
          pageWrapper.style.margin = "0 auto 14px auto";
          pageWrapper.style.setProperty(
            "--total-scale-factor",
            String(viewport.scale)
          );
          pageWrapper.style.setProperty("--scale-round-x", "1px");
          pageWrapper.style.setProperty("--scale-round-y", "1px");

          const deviceScale = window.devicePixelRatio || 1;

          canvas.width = Math.floor(viewport.width * deviceScale);
          canvas.height = Math.floor(viewport.height * deviceScale);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.style.display = "block";
          canvas.style.margin = "0";
          canvas.style.background = "white";
          canvas.style.boxShadow = "0 1px 5px rgba(15, 23, 42, 0.18)";

          textLayerDiv.className = "textLayer";

          context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

          pageWrapper.appendChild(canvas);
          pageWrapper.appendChild(textLayerDiv);
          host.appendChild(pageWrapper);

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
          }).promise;

          if (cancelled) return;

          if (textSelectionEnabled) {
            try {
              const textContent = await page.getTextContent();

              if (cancelled) return;

              const textLayer = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport,
              });

              textLayers.push(textLayer);
              await textLayer.render();
            } catch (textLayerError) {
              if (!cancelled) {
                console.warn(
                  "PDF selectable text layer rendering failed.",
                  textLayerError
                );
              }
            }
          }
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

      for (const textLayer of textLayers) {
        try {
          textLayer.cancel();
        } catch {
          // Ignore cancellation errors during redraw or unmount.
        }
      }
    };
  }, [
    pdf,
    textSelectionEnabled,
    textSelectionPreferencesLoaded,
    zoom,
  ]);

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
    <div
      aria-label="PDF preview controls"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 3,
        padding: "0 0 0 12px",
        margin: 0,
        minHeight: 0,
      }}
    >
      {toolbarPrefix ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}>
          {toolbarPrefix}
        </div>
      ) : null}

      <div
        aria-label="PDF zoom controls"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          padding: 0,
          margin: 0,
          minHeight: 0,
        }}
      >
        <button
          type="button"
          className={zoom === "fit" ? "fsx-button fsx-button-primary" : "fsx-button"}
          onClick={() => setZoom("fit")}
          style={{ padding: "0 6px", fontSize: 11, lineHeight: 1, minHeight: 20 }}
        >
          Fit width
        </button>

        <button
          type="button"
          className="fsx-button"
          onClick={() => applyZoomDelta(-1)}
          disabled={!canZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
          style={{ padding: "0 6px", fontSize: 11, lineHeight: 1, minHeight: 20 }}
        >
          −
        </button>

        <span
          aria-label={`Current zoom: ${zoomLabel(zoom)}`}
          style={{ padding: "0 2px", fontSize: 11, fontWeight: 700, lineHeight: 1 }}
        >
          {zoomLabel(zoom)}
        </span>

        <button
          type="button"
          className="fsx-button"
          onClick={() => applyZoomDelta(1)}
          disabled={!canZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
          style={{ padding: "0 6px", fontSize: 11, lineHeight: 1, minHeight: 20 }}
        >
          +
        </button>
      </div>

      <button
        type="button"
        className={
          textSelectionEnabled
            ? "fsx-button fsx-button-primary"
            : "fsx-button"
        }
        onClick={() => setTextSelectionEnabled((value) => !value)}
        aria-pressed={textSelectionEnabled}
        title={
          textSelectionEnabled
            ? "Disable selectable PDF text"
            : "Enable selectable PDF text"
        }
        style={{
          padding: "0 6px",
          fontSize: 11,
          lineHeight: 1,
          minHeight: 20,
        }}
      >
        Text select: {textSelectionEnabled ? "ON" : "OFF"}
      </button>

      {pdfExists ? (
        <>
          <a
            href={`/api/projects/${projectId}/pdf?inline=1&file=${encodedPdfFile}`}
            target="_blank"
            rel="noreferrer"
            className="fsx-button"
            style={{ padding: "0 6px", fontSize: 11, lineHeight: 1, minHeight: 20 }}
          >
            Open full viewer
          </a>

          <a
            href={`/api/projects/${projectId}/pdf?file=${encodedPdfFile}`}
            className="fsx-button fsx-button-primary"
            style={{ padding: "0 6px", fontSize: 11, lineHeight: 1, minHeight: 20 }}
          >
            Download PDF
          </a>
        </>
      ) : (
        <span
          className="fsx-button"
          aria-disabled="true"
          style={{ padding: "0 6px", fontSize: 11, lineHeight: 1, minHeight: 20 }}
        >
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
        onPointerDown={startResizePreviewHeight}
        style={{
          cursor: "row-resize",
          touchAction: "none",
          height: 22,
          borderRadius: 999,
          background: "linear-gradient(180deg, transparent 0, transparent 10px, #cbd5e1 10px, #cbd5e1 12px, transparent 12px, transparent 100%)",
          margin: "8px 10px 0 10px",
        }}
      />
    </>
  );
}

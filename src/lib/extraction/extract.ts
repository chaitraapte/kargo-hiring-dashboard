import "server-only";

/**
 * pdfjs-dist (wrapped by pdf-parse) references browser canvas globals even on
 * text-only extraction paths. Vercel's serverless Node runtime doesn't define
 * them (unlike some local Node builds), which otherwise throws
 * "DOMMatrix is not defined" only in production. No-op stand-ins are enough
 * since we never render to canvas.
 */
function polyfillPdfJsGlobals() {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = class DOMMatrix {};
  if (typeof g.Path2D === "undefined") g.Path2D = class Path2D {};
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
      ) {}
    };
  }
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    polyfillPdfJsGlobals();
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error(`Unsupported file type: ${filename}`);
}

(function (root) {
  "use strict";

  const PDFJS_VERSION = "5.4.624";
  const MODULE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
  const WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js";
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_PAGES = 150;
  const OCR_MAX_PAGES = 10;

  function textFromItems(items) {
    const lines = [];
    let current = [];
    let previousY = null;

    (items || []).forEach((item) => {
      const value = String(item?.str || "").replace(/\s+/g, " ").trim();
      const y = Number(item?.transform?.[5]);
      const changedLine = previousY !== null && Number.isFinite(y) && Math.abs(y - previousY) > 2;
      if (changedLine && current.length) {
        lines.push(current.join(" ").replace(/\s+([,.;:!?])/g, "$1"));
        current = [];
      }
      if (value) current.push(value);
      if (item?.hasEOL && current.length) {
        lines.push(current.join(" ").replace(/\s+([,.;:!?])/g, "$1"));
        current = [];
      }
      if (Number.isFinite(y)) previousY = y;
    });
    if (current.length) lines.push(current.join(" ").replace(/\s+([,.;:!?])/g, "$1"));
    return lines.map((line) => line.trim()).filter(Boolean).join("\n");
  }

  async function extract(file, onProgress) {
    if (!file) throw new Error("PDF 파일을 선택해 주세요.");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isPdf) throw new Error("PDF 형식의 파일만 사용할 수 있습니다.");
    if (file.size > MAX_BYTES) throw new Error("PDF는 20MB 이하만 사용할 수 있습니다.");

    onProgress?.("PDF 분석 도구를 준비하고 있습니다.");
    const pdfjs = await import(MODULE_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    if (pageCount > MAX_PAGES) throw new Error(`페이지가 너무 많습니다. ${MAX_PAGES}쪽 이하의 직무소개서만 사용해 주세요.`);

    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      onProgress?.(`${pageCount}쪽 중 ${pageNumber}쪽에서 글자를 읽고 있습니다.`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = textFromItems(content.items);
      if (text) pages.push(`[${pageNumber}쪽]\n${text}`);
      page.cleanup();
    }
    let fullText = pages.join("\n\n").trim();
    let mode = "embedded_text";
    if (fullText.replace(/\s/g, "").length < 80) {
      if (pageCount > OCR_MAX_PAGES) {
        throw new Error(`이미지형 PDF는 글자 인식 처리 시간이 길어 ${OCR_MAX_PAGES}쪽 이하만 지원합니다. 지원할 직무 페이지만 분리해 다시 넣어 주세요.`);
      }
      mode = "browser_ocr";
      onProgress?.("선택 가능한 글자가 없어 이미지 글자 인식을 준비하고 있습니다. 처음에는 언어 파일을 내려받아 시간이 걸릴 수 있습니다.");
      const { createWorker } = await import(TESSERACT_URL);
      const worker = await createWorker(["kor", "eng"], 1, {
        logger: (message) => {
          if (message?.status === "recognizing text" && Number.isFinite(message.progress)) {
            onProgress?.(`이미지 글자를 읽고 있습니다. ${Math.round(message.progress * 100)}%`);
          }
        },
      });
      const ocrPages = [];
      try {
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          onProgress?.(`${pageCount}쪽 중 ${pageNumber}쪽을 이미지에서 글자를 읽고 있습니다.`);
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.8 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          await page.render({ canvasContext: context, viewport }).promise;
          const recognized = await worker.recognize(canvas);
          const text = String(recognized?.data?.text || "").trim();
          if (text) ocrPages.push(`[${pageNumber}쪽 글자 인식]\n${text}`);
          page.cleanup();
          canvas.width = 1;
          canvas.height = 1;
        }
      } finally {
        await worker.terminate();
      }
      fullText = ocrPages.join("\n\n").trim();
      if (fullText.replace(/\s/g, "").length < 80) {
        throw new Error("이미지에서 글자를 읽어봤지만 충분히 읽지 못했습니다. 더 선명한 PDF나 지원할 직무 부분의 이미지를 사용해 주세요.");
      }
    }
    await pdf.destroy();
    return { text: fullText, pages: pageCount, characters: fullText.length, fileName: file.name, mode };
  }

  root.JDPdfImport = { PDFJS_VERSION, MAX_BYTES, MAX_PAGES, OCR_MAX_PAGES, textFromItems, extract };
  if (typeof module !== "undefined" && module.exports) module.exports = root.JDPdfImport;
})(typeof window !== "undefined" ? window : globalThis);

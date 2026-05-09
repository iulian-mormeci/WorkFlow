"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportInterventionPdf(options: { filename: string }) {
  const el = document.getElementById("workflow-pdf-root");
  if (!el) throw new Error("PDF root not found");

  // Ensure images are loaded
  await Promise.all(
    Array.from(el.querySelectorAll("img")).map(
      (img) =>
        new Promise<void>((resolve) => {
          if ((img as HTMLImageElement).complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );

  const canvas = await html2canvas(el as HTMLElement, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  const pdf = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 40;
  const footerY = pageHeight - 18;

  // Fit to page width
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let y = 0;
  let remaining = imgHeight;

  pdf.addImage(imgData, "JPEG", 0, y, imgWidth, imgHeight);
  const exportedAt = new Date().toLocaleString();
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text(`WorkFlow • ${exportedAt}`, marginX, footerY);
  remaining -= pageHeight;

  while (remaining > 0) {
    pdf.addPage();
    y = remaining - imgHeight;
    pdf.addImage(imgData, "JPEG", 0, y, imgWidth, imgHeight);
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(`WorkFlow • ${exportedAt}`, marginX, footerY);
    remaining -= pageHeight;
  }

  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(`Page ${i} / ${totalPages}`, pageWidth - marginX, footerY, { align: "right" });
  }

  pdf.save(options.filename);
}


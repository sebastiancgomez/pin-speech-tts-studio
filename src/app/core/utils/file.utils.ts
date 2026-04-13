import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';

// Configuramos el worker de PDF.js
// Equivalente a configurar un servicio externo en Program.cs
pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items
      .map((item: any) => item.str)
      .join(' ') + '\n';
  }

  return fullText.trim();
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'pdf':
      return extractTextFromPdf(file);
    case 'docx':
    case 'doc':
      return extractTextFromDocx(file);
    default:
      throw new Error(`Unsupported file type: .${extension}`);
  }
}
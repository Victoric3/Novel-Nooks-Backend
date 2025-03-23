let pdfjsLib;

try {
  // Try default import first (no warnings in dev)
  pdfjsLib = require('pdfjs-dist');
} catch (error) {
  // If that fails, use legacy build (works in Azure)
  console.log('Falling back to legacy PDF.js build');
  pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
}

// Disable worker in Node.js environment
pdfjsLib.GlobalWorkerOptions.workerPort = null;

const fs = require('fs');

const extractTextFromPdf = async (pdfBuffer) => {
  // Convert Buffer to Uint8Array
  const pdfData = new Uint8Array(pdfBuffer);

  // Load the PDF document
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;

  // Extract text from each page
  const numPages = pdfDoc.numPages;
  const pages = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map(item => item.str).join(' ');
    pages.push(text);
  }
  return { pdfDoc, pages };
};

/**
 * Checks if a page is likely part of the TOC
 * @param {string} pageText - Text of the page
 * @returns {boolean} - True if the page resembles a TOC
 */
const isTocPage = (pageText) => {
  const lines = pageText.split('\n');
  const tocLines = lines.filter(line => /^\s*(.*?)\s+\d+\s*$/.test(line));
  return tocLines.length / lines.length > 0.3; // More than 30% of lines look like TOC entries
};

/**
 * Extracts chapters from TOC text
 * @param {string} tocText - Concatenated text of TOC pages
 * @returns {Array<{title: string, startPage: number}>} - Chapters with titles and 0-based start pages
 */
const getChaptersFromToc = (tocText) => {
  const lines = tocText.split('\n');
  const chapters = [];
  for (const line of lines) {
    const match = line.match(/(.+?)\s*(\d+)\s*$/);
    if (match) {
      const title = match[1].trim();
      const pageNumber = parseInt(match[2], 10);
      if (!isNaN(pageNumber)) {
        chapters.push({ title, startPage: pageNumber - 1 }); // Convert to 0-based index
      }
    }
  }
  return chapters;
};

/**
 * Extracts chapters from the PDF outline
 * @param {Array} outline - PDF outline array
 * @param {Object} pdfDoc - PDF document object
 * @returns {Promise<Array<{title: string, startPage: number}>>} - Chapters from outline
 */
const getChaptersFromOutline = async (outline, pdfDoc) => {
  const chapters = [];
  for (const item of outline) {
    const title = item.title;
    let pageIndex;
    if (typeof item.dest === 'string') {
      const dest = await pdfDoc.getDestination(item.dest);
      if (dest) {
        const ref = dest[0];
        pageIndex = await pdfDoc.getPageIndex(ref);
      }
    } else if (Array.isArray(item.dest)) {
      const ref = item.dest[0];
      pageIndex = await pdfDoc.getPageIndex(ref);
    }
    if (pageIndex !== undefined) {
      chapters.push({ title, startPage: pageIndex });
    }
    if (item.items && item.items.length > 0) {
      const subChapters = await getChaptersFromOutline(item.items, pdfDoc);
      chapters.push(...subChapters);
    }
  }
  return chapters;
};

/**
 * Detects chapters by searching for heading patterns
 * @param {Array<string>} pages - Array of page texts
 * @returns {Array<{title: string, startPage: number}>} - Detected chapters
 */
const getChaptersFromHeadings = (pages) => {
  const headingPatterns = [
    /^Chapter \d+:/,
    /^Part \d+:/,
    /^Section \d+:/,
    /^\d+\./,
  ];
  const chapters = [];
  for (let i = 0; i < pages.length; i++) {
    const lines = pages[i].split('\n');
    for (const line of lines) {
      for (const pattern of headingPatterns) {
        if (pattern.test(line.trim())) {
          chapters.push({ title: line.trim(), startPage: i });
          break;
        }
      }
      if (chapters.length > 0 && chapters[chapters.length - 1].startPage === i) {
        break; // Use first match per page
      }
    }
  }
  return chapters;
};

/**
 * Splits the PDF into chapters using outline, TOC, or headings
 * @param {Object} pdfDoc - PDF document object
 * @param {Array<string>} pages - Array of page texts
 * @returns {Promise<Array<{title: string, content: string}>>} - Array of chapter objects
 */
const splitIntoChapters = async (pdfDoc, pages) => {
  let chapters = [];

  // Step 1: Try the PDF outline
  const outline = await pdfDoc.getOutline();
  if (outline && outline.length > 0) {
    chapters = await getChaptersFromOutline(outline, pdfDoc);
  }

  // Step 2: If no outline, parse the TOC
  if (chapters.length === 0) {
    let tocPages = [];
    for (let i = 0; i < Math.min(10, pages.length); i++) {
      const pageText = pages[i].toLowerCase();
      if (pageText.includes('contents') || pageText.includes('table of contents')) {
        tocPages.push(pages[i]);
        for (let j = i + 1; j < pages.length; j++) {
          if (isTocPage(pages[j])) {
            tocPages.push(pages[j]);
          } else {
            break;
          }
        }
        break;
      }
    }
    if (tocPages.length > 0) {
      const tocText = tocPages.join('\n');
      chapters = getChaptersFromToc(tocText);
    }
  }

  // Step 3: If no outline or TOC, detect headings
  if (chapters.length === 0) {
    chapters = getChaptersFromHeadings(pages);
  }

  // Sort chapters by startPage and remove duplicates
  chapters.sort((a, b) => a.startPage - b.startPage);
  chapters = chapters.filter((ch, idx, self) => 
    idx === 0 || ch.startPage !== self[idx - 1].startPage
  );

  // Step 4: Build chapter objects with content
  const chapterObjects = [];
  for (let i = 0; i < chapters.length; i++) {
    const current = chapters[i];
    const next = i < chapters.length - 1 ? chapters[i + 1] : null;
    const endPage = next ? next.startPage : pages.length;
    const chapterPages = pages.slice(current.startPage, endPage);
    const content = chapterPages.join('\n');
    chapterObjects.push({ title: current.title, content });
  }

  return chapterObjects;
};

/**
 * Processes a PDF into chapters
 * @param {string|Buffer} filePathOrBuffer - PDF file path or buffer
 * @returns {Promise<Object>} - Processed book data
 */
const processPdf = async (pdfBuffer) => {
  try {
    // Ensure pdfBuffer is valid
    if (!(pdfBuffer instanceof Buffer)) {
      throw new Error('Invalid PDF data type');
    }

    // Pass the buffer to extractTextFromPdf
    const { pdfDoc, pages } = await extractTextFromPdf(pdfBuffer);

    // Assuming splitIntoChapters is another function you have
    const chapters = await splitIntoChapters(pdfDoc, pages);

    return {
      chapters,
      content: chapters.map(ch => ch.content),
      contentTitles: chapters.map(ch => ch.title),
      contentCount: chapters.length
    };
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw new Error('Failed to process PDF file');
  }
};

module.exports = {
  extractTextFromPdf,
  processPdf,
  isTocPage,
  getChaptersFromToc,
  getChaptersFromOutline,
  getChaptersFromHeadings,
  splitIntoChapters
};
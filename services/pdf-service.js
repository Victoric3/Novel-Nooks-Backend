const pdfParse = require('pdf-parse');
const fs = require('fs');

/**
 * Extracts text content from a PDF file
 * @param {Buffer|string} pdfBuffer - PDF file buffer or path
 * @returns {Promise<string>} - Raw text from the PDF
 */
const extractTextFromPdf = async (pdfBuffer) => {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

/**
 * Split PDF text into logical chapters
 * Uses various heuristics to detect chapter boundaries
 * @param {string} pdfText - Raw text extracted from PDF
 * @returns {Array<{title: string, content: string}>} - Array of chapter objects
 */
const splitIntoChapters = (pdfText) => {
  // Common chapter patterns
  const chapterPatterns = [
    /\bCHAPTER\s+(\d+|[A-Z]+|\w+)\s*[:.]\s*(.*?)(?=\n)/gi,
    /\bCh\.?\s+(\d+|[A-Z]+|\w+)\s*[:.]\s*(.*?)(?=\n)/gi,
    /\b(PART|BOOK)\s+(\d+|[A-Z]+|\w+)\s*[:.]\s*(.*?)(?=\n)/gi,
    /\n\s*(\d+|[IVX]+)\s*\.\s*(.*?)(?=\n)/g,
    /\n\s*(\d+)\s*\n/g
  ];
  
  // Find all potential chapter boundaries
  let chapterBreaks = [];
  let chapterTitles = [];
  
  // Try each pattern to find chapter markers
  for (const pattern of chapterPatterns) {
    let match;
    const patternCopy = new RegExp(pattern.source, pattern.flags);
    while ((match = patternCopy.exec(pdfText)) !== null) {
      const position = match.index;
      const title = match[0].trim();
      chapterBreaks.push(position);
      chapterTitles.push(title);
    }
  }
  
  // If no chapter markers found, use page breaks or fixed length
  if (chapterBreaks.length === 0) {
    // Look for page breaks or split by fixed characters
    const pageBreaks = [...pdfText.matchAll(/\f|\n\s*\n\s*\n/g)].map(match => match.index);
    
    if (pageBreaks.length > 0) {
      chapterBreaks = pageBreaks;
      chapterTitles = Array(pageBreaks.length).fill('');
    } else {
      // If no page breaks, split by fixed length (e.g., every 5000 chars)
      const chunkSize = 5000;
      for (let i = 0; i < pdfText.length; i += chunkSize) {
        // Find nearest paragraph break
        let breakPoint = pdfText.indexOf('\n\n', i + chunkSize / 2);
        if (breakPoint === -1 || breakPoint > i + chunkSize * 1.5) {
          breakPoint = i + chunkSize;
        }
        chapterBreaks.push(breakPoint);
        chapterTitles.push(`Chapter ${Math.floor(i / chunkSize) + 1}`);
      }
    }
  }
  
  // Sort breaks in ascending order
  const sortedData = chapterBreaks
    .map((pos, idx) => ({ pos, title: chapterTitles[idx] }))
    .sort((a, b) => a.pos - b.pos);
  
  // Extract chapters based on the breaks
  const chapters = [];
  const chapterContentList = [];
  const chapterTitleList = [];
  
  for (let i = 0; i < sortedData.length; i++) {
    const startPos = sortedData[i].pos;
    const endPos = i < sortedData.length - 1 ? sortedData[i+1].pos : pdfText.length;
    let chapterContent = pdfText.substring(startPos, endPos).trim();
    
    // Remove the chapter title from the content
    const titleLength = sortedData[i].title.length;
    if (titleLength > 0) {
      chapterContent = chapterContent.substring(titleLength).trim();
    }
    
    // Only add if chapter has substantial content
    if (chapterContent.length > 100) {
      chapters.push({
        title: sortedData[i].title || `Chapter ${i+1}`,
        content: chapterContent
      });
      chapterContentList.push(chapterContent);
      chapterTitleList.push(sortedData[i].title || `Chapter ${i+1}`);
    }
  }
  
  // If no chapters were created, create a single chapter from the entire text
  if (chapters.length === 0) {
    chapters.push({
      title: 'Chapter 1',
      content: pdfText.trim()
    });
    chapterContentList.push(pdfText.trim());
    chapterTitleList.push('Chapter 1');
  }
  
  return {
    chapters,
    chapterContentList,
    chapterTitleList
  };
};

/**
 * Calculate read time for text content
 * @param {string} text - Content to calculate read time for
 * @returns {number} - Read time in minutes
 */
const calculateReadTime = (text) => {
  if (!text) return 0;
  const wordCount = text.trim().split(/\s+/).length;
  return Math.floor(wordCount / 200); // Assuming average reading speed of 200 words per minute
};

/**
 * Process a PDF file into chapters
 * @param {string|Buffer} filePathOrBuffer - Path to PDF file or file buffer
 * @returns {Promise<Object>} - Object with chapters array, content list and title list
 */
const processPdf = async (filePathOrBuffer) => {
  try {
    let pdfData;
    
    // Handle both file paths and buffers
    if (typeof filePathOrBuffer === 'string') {
      // It's a file path
      pdfData = await fs.promises.readFile(filePathOrBuffer);
    } else {
      // It's already a buffer
      pdfData = filePathOrBuffer;
    }
    
    // Extract text from PDF
    const pdfText = await extractTextFromPdf(pdfData);
    
    // Split into chapters
    const { chapters, chapterContentList, chapterTitleList } = splitIntoChapters(pdfText);
    
    // Calculate read time for each chapter
    const readTimes = chapterContentList.map(calculateReadTime);
    
    return {
      chapters,
      content: chapterContentList,
      contentTitles: chapterTitleList,
      readTimes,
      contentCount: chapters.length
    };
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw new Error('Failed to process PDF file');
  }
};

module.exports = {
  extractTextFromPdf,
  splitIntoChapters,
  calculateReadTime,
  processPdf
};
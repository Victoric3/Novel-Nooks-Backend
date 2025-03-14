const path = require('path');
const fs = require('fs-extra');
const { processPdf } = require('../../services/pdf-service');

const pdfProcessor = async (req, res, next) => {
  try {
    // Check if a file was uploaded and if it's a PDF
    if (!req.file || !req.file.mimetype.includes('pdf')) {
      return next();
    }

    const rootDir = path.dirname(require.main.filename);
    const filePath = path.join(rootDir, "/public/uploads/", req.savedFileName);

    // Process the PDF
    const { content, contentTitles, readTimes, contentCount } = await processPdf(filePath);
    
    // Add the extracted data to the request
    req.pdfData = {
      content,
      contentTitles,
      readTimes,
      contentCount
    };
    
    next();
  } catch (error) {
    console.error('PDF processing error:', error);
    return res.status(500).json({
      success: false,
      errorMessage: 'Failed to process PDF file'
    });
  }
};

module.exports = pdfProcessor;
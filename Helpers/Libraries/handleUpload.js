// uploadMiddleware.js
const { imageUpload } = require("./imageUpload");
const deleteImageFile = require("./deleteImageFile");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { processPdf } = require("../../services/pdf-service");

const handleImageUpload = async (req, res, next) => {
  const apiKey = "ffd36b269b0ca78afc1308c7bc256530";
  try {
    // Upload the image to Google Drive
    imageUpload(req, res, async function (err) {
      // Check if there is a file in the request
      if (!req.file) {
        // No file provided, continue to the next middleware
        return next();
      }

      if (err) {
        return next(err);
      }

      // Get the file buffer
      const fileBuffer = req.file.buffer;

      // Encode the file buffer as base64
      const base64Image = fileBuffer?.toString("base64");

      const form = new FormData();

      form.append("key", apiKey);
      form.append("image", base64Image);
      // Make a POST request to ImgBB API
      const response = await axios.post(
        "https://api.imgbb.com/1/upload",
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
        }
      );

      // Extract the URL from the ImgBB API response
      const imageUrl = response.data.data.url;

      // Attach the fileLink to the request object for later use in the route handler
      req.fileLink = imageUrl;

      // Delete the locally uploaded file
      deleteImageFile(req);

      // Continue to the next middleware
      next();
    });
  } catch (error) {
    // Handle errors, delete the locally uploaded file, and pass the error to the next middleware
    deleteImageFile(req);
    next(error);
  }
};

// Update the handleStoryUpload function to be more memory efficient

const handleStoryUpload = async (req, res, next) => {
  const apiKey = process.env.IMAGE_UPLOAD_API_KEY;

  // Set file size limits and other options
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB max file size
    },
    fileFilter: (req, file, cb) => {
      // Only accept PDFs and images
      if (file.fieldname === "pdfFile" && file.mimetype !== "application/pdf") {
        return cb(new Error("Only PDF files are allowed for PDF uploads"));
      }
      if (file.fieldname === "image" && !file.mimetype.startsWith("image/")) {
        return cb(new Error("Only image files are allowed for image uploads"));
      }
      cb(null, true);
    },
  });

  try {
    // Handle both image and PDF uploads
    upload.fields([
      { name: "pdfFile", maxCount: 1 },
      { name: "image", maxCount: 1 },
    ])(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          errorMessage: `Upload error: ${err.message}`,
        });
      }

      // Process image if uploaded - with error handling
      if (req.files && req.files["image"] && req.files["image"][0]) {
        try {
          const imageFile = req.files["image"][0];
          const fileBuffer = imageFile.buffer;
          const base64Image = fileBuffer.toString("base64");

          const form = new FormData();
          form.append("key", apiKey);
          form.append("image", base64Image);

          const response = await axios.post(
            "https://api.imgbb.com/1/upload",
            form,
            { headers: { ...form.getHeaders() } }
          );
          req.fileLink = response.data.data.url;

          // Clear buffer to free memory
          imageFile.buffer = null;
        } catch (imageError) {
          console.error("Image upload error:", imageError);
          // Continue without image if upload fails
        }
      }

      // Process PDF if uploaded - with streaming and memory optimization
      if (req.files && req.files["pdfFile"] && req.files["pdfFile"][0]) {
        try {
          const pdfFile = req.files["pdfFile"][0];

          // Process PDF in chunks to reduce memory usage
          const pdfData = await processPdf(pdfFile.buffer, {
            maxContentLength: 500000, // Limit content size per chapter
            maxChapters: 100, // Limit number of chapters
          });

          req.pdfData = pdfData;

          // Clear buffer to free memory
          pdfFile.buffer = null;
        } catch (pdfError) {
          console.error("PDF processing error:", pdfError);
          return res.status(400).json({
            success: false,
            errorMessage: `PDF processing error: ${pdfError.message}`,
          });
        }
      }

      next();
    });
  } catch (error) {
    console.error("File upload error:", error);
    return res.status(500).json({
      success: false,
      errorMessage: `Upload error: ${error.message}`,
    });
  }
};

const handleImageandFileUpload = async (req, res, next) => {
  const apiKey = process.env.IMAGE_UPLOAD_API_KEY;
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });
  try {
    // Upload the image to Google Drive
    upload.fields([
      { name: "csvFile", maxCount: 1 },
      { name: "image", maxCount: 1 },
    ])(req, res, async function (err) {
      const imageFile = req.files["image"][0];

      // Check if there is a file in the request
      if (!imageFile) {
        // No file provided, continue to the next middleware
        return next();
      }

      if (err) {
        return next(err);
      }

      // Get the file buffer
      const fileBuffer = imageFile?.buffer;

      // Encode the file buffer as base64
      const base64Image = fileBuffer?.toString("base64");

      const form = new FormData();

      form.append("key", apiKey);
      form.append("image", base64Image);
      // Make a POST request to ImgBB API
      const response = await axios.post(
        "https://api.imgbb.com/1/upload",
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
        }
      );

      // Extract the URL from the ImgBB API response
      const imageUrl = response.data.data.url;

      // Attach the fileLink to the request object for later use in the route handler
      req.fileLink = imageUrl;

      // Delete the locally uploaded file
      deleteImageFile(req);

      // Continue to the next middleware
      next();
    });
  } catch (error) {
    // Handle errors, delete the locally uploaded file, and pass the error to the next middleware
    deleteImageFile(req);
    next(error);
  }
};

// Function to delete locally uploaded files
const deleteImageFiles = (req) => {
  const imageFiles = req.files["images"];

  if (imageFiles) {
    imageFiles.forEach((file) => {
      deleteImageFile(file.path);
    });
  }
};

const handleMultipleImageUpload = async (req, res, next) => {
  const apiKey = "ffd36b269b0ca78afc1308c7bc256530";
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  try {
    upload.array("images", 3)(req, res, async function (err) {
      const imageFiles = req.files["images"];

      // Check if there are files in the request
      if (!imageFiles || imageFiles.length === 0) {
        // No files provided, continue to the next middleware
        return next();
      }

      if (err) {
        return next(err);
      }

      // Process each uploaded image
      const imageUrls = await Promise.all(
        imageFiles.map(async (imageFile) => {
          // Get the file buffer
          const fileBuffer = imageFile.buffer;

          // Encode the file buffer as base64
          const base64Image = fileBuffer.toString("base64");

          const form = new FormData();

          form.append("key", apiKey);
          form.append("image", base64Image);

          // Make a POST request to ImgBB API for each image
          const response = await axios.post(
            "https://api.imgbb.com/1/upload",
            form,
            {
              headers: {
                ...form.getHeaders(),
              },
            }
          );

          // Extract the URL from the ImgBB API response
          return response.data.data.url;
        })
      );

      // Attach the imageUrls to the request object for later use in the route handler
      req.imageUrls = imageUrls;

      // Continue to the next middleware
      next();
    });
  } catch (error) {
    // Handle errors, delete the locally uploaded files, and pass the error to the next middleware
    deleteImageFiles(req);
    next(error);
  }
};

module.exports = {
  handleImageUpload,
  handleImageandFileUpload,
  handleMultipleImageUpload,
  handleStoryUpload, // Export the new function
};

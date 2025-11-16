process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

const routes = require("./Routers");
const express = require("express");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");

const IndexRoute = require("./Routers/index");
const connectDatabase = require("./Helpers/database/connectDatabase");
const customErrorHandler = require("./Middlewares/Errors/customErrorHandler");

dotenv.config({ path: "./config.env" });

connectDatabase();

const app = express();
app.use(express.json());

app.use(cookieParser());

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  keyGenerator: (req) => {
    // Use the user object to identify the user
    return req.user?.id || req.ip;
  },
});

// Apply rate limiter
app.use(limiter);

const allowedOrigins = [
  process.env.URL, // Production URL
  process.env.FRONTEND_DEV_URL, // Development URL from config
  "http://localhost:3000", // Local development
  "http://localhost:3001", // Alternative port
  "http://127.0.0.1:3000", // Alternative localhost
  "http://127.0.0.1:3001",
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

app.get("/", (req, res) => {
  res.send("server successfully running");
});
app.use("/", IndexRoute);

app.use(customErrorHandler);

app.use(process.env.API_VERSION, routes);

const PORT = process.env.PORT || 8000;

app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(PORT, () => {
  console.log(`Server running on port  ${PORT} : ${process.env.NODE_ENV}`);
});

process.on("unhandledRejection", (err, promise) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  console.error(err.stack);
  server.close(() => process.exit(1));
});

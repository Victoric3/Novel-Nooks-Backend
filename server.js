process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

const routes = require('./Routers');
const express = require("express")
const cookieParser = require('cookie-parser');
const dotenv = require("dotenv")
const cors = require("cors")
const path = require("path")
const rateLimit = require('express-rate-limit');

const IndexRoute = require("./Routers/index")
const connectDatabase = require("./Helpers/database/connectDatabase")
const customErrorHandler = require("./Middlewares/Errors/customErrorHandler")

dotenv.config({ path: './config.env' })

connectDatabase();

const app = express();
app.use(express.json());

app.use(cookieParser());

rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // 1000 requests per minute
    keyGenerator: (req) => {
      // Use the user object to identify the user
      return req.user
    },
  });
  // const allowedOrigin = process.env.URL;
  // const corsOptions = {
  //   origin: allowedOrigin, // Allow only the specific URL from the environment variable
  //   credentials: true,     // Allow credentials (cookies, authorization headers, etc.)
  //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // };
  app.use(cors());

app.get('/', (req, res) => {
    res.send('server successfully running');
  });
app.use("/",IndexRoute)

app.use(customErrorHandler)

app.use(process.env.API_VERSION, routes);

const PORT = process.env.PORT || 8000 ;

app.use(express.static(path.join(__dirname , "public") ))

const server = app.listen(PORT, () => {

    console.log(`Server running on port  ${PORT} : ${process.env.NODE_ENV}`)

})

process.on("unhandledRejection",(err , promise) =>{
    console.error(`Unhandled Rejection: ${err.message}`);
    console.error(err.stack);
    server.close(()=>process.exit(1))
})
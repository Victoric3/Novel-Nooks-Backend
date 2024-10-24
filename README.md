# Sushmeela Backend

This is the backend for the Sushmeela website, responsible for handling user authentication, stories management, user scheduling, comments, and sitemap generation. The backend is built using Node.js and Express, with MongoDB as the database.

## Table of Contents

- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Available Routes](#available-routes)
- [Environment Variables](#environment-variables)
- [Dependencies](#dependencies)
- [Author](#author)

## Installation

To get started with the project, clone the repository and install the necessary dependencies.

```bash
git clone <repository-url>
cd sushmeela-backend
npm install
```

## Running the Application

To start the application in development mode, use:

```bash
npm start
```

This command will start the server using `nodemon`, which automatically restarts the server when changes are detected.

## Project Structure

```plaintext
sushmeela-backend/
│
├── controllers/        # Controllers for handling requests
├── models/             # Mongoose models (User, Story, etc.)
├── routes/             # Express routes for different API endpoints
├── utils/              # Utility functions (e.g., authentication)
├── views/              # Views/templates (if using server-side rendering)
├── config/             # Configuration files (e.g., database connection)
├── server.js           # Entry point of the application
└── README.md           # Project documentation
```

## Available Routes

The backend API exposes several endpoints for managing various aspects of the Sushmeela website:

### Authentication

- `POST /auth/register` - Register a new user
- `POST /auth/login` - Log in a user
- `POST /auth/logout` - Log out the current user
- `GET /auth/me` - Get the authenticated user's information

### Stories

- `GET /story` - Get all stories
- `GET /story/:id` - Get a specific story by ID
- `POST /story` - Create a new story (requires authentication)
- `PUT /story/:id` - Update a story by ID (requires authentication)
- `DELETE /story/:id` - Delete a story by ID (requires authentication)

### Users

- `GET /user` - Get all users
- `GET /user/:id` - Get a specific user by ID
- `PUT /user/:id` - Update user information (requires authentication)
- `DELETE /user/:id` - Delete a user by ID (requires authentication)

### Schedule a Call

- `POST /call/schedule` - Schedule a call with Sushmeela

### Comments

- `POST /comment` - Add a comment to a story (requires authentication)
- `GET /comment/:id` - Get comments for a specific story

### Sitemap

- `GET /sitemap.xml` - Get the sitemap for the website

## Environment Variables

To run the application, you need to create a `.env` file in the root directory with the following environment variables:

```plaintext
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
CLOUDINARY_URL=your_cloudinary_url
SMTP_HOST=smtp_host
SMTP_PORT=smtp_port
SMTP_USER=smtp_user
SMTP_PASS=smtp_password
```

## Dependencies

The project relies on the following major dependencies:

- **Express**: Fast, unopinionated, minimalist web framework for Node.js
- **Mongoose**: MongoDB object modeling tool designed to work in an asynchronous environment
- **jsonwebtoken**: For generating and verifying JWT tokens
- **bcryptjs**: For hashing and comparing passwords
- **nodemailer**: For sending emails (e.g., password resets, contact forms)
- **multer**: Middleware for handling `multipart/form-data` (file uploads)
- **express-rate-limit**: Basic rate-limiting middleware for Express
- **pm2**: Advanced, production process manager for Node.js
- **sitemap**: Generates sitemaps for SEO

For a complete list of dependencies, refer to the `package.json` file.

## Author

This backend was developed by Chukwujiobi Victor Ifeanyi.

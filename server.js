// index.js
require('dotenv').config();
const express = require('express');

const passport = require('passport');
const connectDB = require('./db');
const authRoutes = require('./routes/authRoutes');
const router  = require('./routes/api');
const cookieSession = require('cookie-session');
require('./passport');
const cors = require('cors'); // Import cors
const isLoggedIn = require('./middleware/auth');

const app = express();

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Specify allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
    credentials: true, // Include credentials in the CORS requests
    preflightContinue: false,
    optionsSuccessStatus: 204, // Some legacy browsers (IE11, various SmartTVs) choke on 204,
  }));
  app.set('trust proxy', 1)  // you need to add this

app.use(cookieSession({
  name: 'google-auth-session',
  keys: ['key1', 'key2'],
  proxy: true, // Optional, depends on the server you're hosting on. For Heroku, you might need it.
  cookie: {
    secure: true, 
    maxAge: 100000000, // 10 seconds for testing
    sameSite: "none", // In development, this will default to 'lax'. Set to 'none' for cross-site requests.
  }
}))

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
// Connect to MongoDB
connectDB();

const port = process.env.PORT || 8000

app.get("/", (req, res) => {
    res.status(401).json({message: "You are not logged in"});
});


app.use(authRoutes);
app.use('/api', router);

app.listen(port, () => console.log(`Server running on port ${port}`));
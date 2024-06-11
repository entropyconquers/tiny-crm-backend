// index.js
require('dotenv').config();
const express = require('express');
const connectDB = require('./db');
const router = require('./routes/api');


const cors = require('cors'); // Import cors

const app = express();
app.use(cors(
    {
        origin: process.env.FRONTEND_URL,
        credentials: true

    }
));

app.use(express.json());
// Connect to MongoDB
connectDB();

const port = process.env.PORT || 8000

app.get("/", (req, res) => {
    res.status(401).json({ message: "You are not logged in" });
});


app.use('/api', router);

app.listen(port, () => console.log(`Server running on port ${port}`));
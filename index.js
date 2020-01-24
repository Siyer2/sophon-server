require('dotenv').config();
var express = require('express');
var app = express();
var cors = require('cors');
var websockify = require('@maximegris/node-websockify');

const port = process.env.PORT ? process.env.PORT : 5902;

// Initialise the database
app.use(express.json());

// Configure CORS
var corsOptions = {
    origin: process.env.DEPLOYMENT === 'production' ? [process.env.PRODURL, 'http://localhost:3000'] : 'http://localhost:3000',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
app.use(cors(corsOptions));

// Controllers
var HomeController = require('./controllers/HomeController');
var ExamController = require('./controllers/ExamController');

// Routes
app.use('/', HomeController);
app.use('/exam', ExamController);

// Start the server
app.listen(port, function (err) {
    if (err) {
        throw err;
    }

    console.log(`API running on port ${port}...`);
    websockify({
        source: 'localhost:5901',
        target: '3.104.110.103:5901'
    });
});
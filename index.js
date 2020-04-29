require('dotenv').config();
var express = require('express');
var app = express();
var cors = require('cors');
require('express-ws')(app); // DELETE
var server = require('http').Server(app);
var config = require('./config');

const port = process.env.PORT ? process.env.PORT : 5902;

// Server config
app.use(express.json());

// Configure CORS
var corsOptions = {
    origin: config.settings.ALLOWED_APP_URLS,
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
app.use(cors(corsOptions));

// Controllers
var HomeController = require('./controllers/HomeController');
var ExamController = require('./controllers/ExamController');
var AuthController = require('./controllers/AuthController');

// Routes
app.use('/', HomeController);
app.use('/exam', ExamController);
app.use('/auth', AuthController);

// Start the server
server.listen(port, function (err) {
    if (err) {
        throw err;
    }

    console.log(`API running on port ${port}...`);
});
var router = (require('express')).Router();
var websockify = require('@maximegris/node-websockify');

// Additional libraries
var moment = require('moment');

// Student enters an exam
router.post('/enter', function (request, response) {
    // Concurrently run the docker container (bare OS) AND search what applications are required

    // Add the required applications to the OS

    // Run the proxy server
    websockify({ source: 'localhost:5901', target: 'localhost:32770' });

    response.send('API is working @ 19:36');
});

module.exports = router;
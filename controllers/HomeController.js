var router = (require('express')).Router();

// Additional libraries
var moment = require('moment');

router.use(function timeLog(request, response, next) {
    console.log(`Path: ${request.path}, Time: ${moment().format('LLLL')}`);
    next();
});

router.get('/', function (request, response) {
    response.send('API is working @ 19:36');
});

module.exports = router;
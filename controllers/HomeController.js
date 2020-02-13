var router = (require('express')).Router();
const jwt = require('jsonwebtoken');
const passport = require('passport');
require('../services/passport');

// Additional libraries
var moment = require('moment');

router.use(function timeLog(request, response, next) {
    console.log(`Path: ${request.path}, Time: ${moment().format('LLLL')}`);
    next();
});

//==== Testing ====//
router.get('/', function (request, response) {
    response.send('API is working @ 19:36');
});

router.post('/auth', passport.authenticate('jwt', { session: false }), function (request, response) {
        response.send(request.user);
    }
);

//==== Authentication ====//
router.post('/login', function (request, response) {
    try {
        passport.authenticate('local', { session: false }, (err, user, info) => {
            if (err || !user) {
                return response.status(400).json({
                    message: 'Something is not right',
                    user: user
                });
            }
            request.login(user, { session: false }, (err) => {
                if (err) {
                    response.send(err);
                }
                // generate a signed son web token with the contents of user object and return it in the response
                const token = jwt.sign(user, 'your_jwt_secret');
                return response.json({ user, token });
            });
        })(request, response);
    } catch (error) {
        return response.status(500).json({ error });
    }
});

module.exports = router;
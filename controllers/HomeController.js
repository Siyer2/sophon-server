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

router.post('/auth', passport.authenticate('jwt', { session: false }), function (req, res) {
        res.send(req.user);
    }
);

//==== Authentication ====//
router.post('/login', function (req, res, next) {
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err || !user) {
            return res.status(400).json({
                message: 'Something is not right',
                user: user
            });
        }
        req.login(user, { session: false }, (err) => {
            if (err) {
                res.send(err);
            }
            // generate a signed son web token with the contents of user object and return it in the response
            const token = jwt.sign(user, 'your_jwt_secret');
            return res.json({ user, token });
        });
    })(req, res);
});

module.exports = router;
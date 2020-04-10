var router = (require('express')).Router();
const jwt = require('jsonwebtoken');
const passport = require('passport');
require('../services/passport');
const dbHelper = require('../services/database');
const { hashPassword } = require('../services/helperFunctions');

// Additional libraries
var moment = require('moment');

router.use(async function timeLog(request, response, next) {
    console.log(`Path: ${request.path}, Time: ${moment().format('LLLL')}`);

    // Pass DB object in request
    const db = await new dbHelper();
    request.db = db;

    next();
});

//==== Testing ====//
router.get('/', async function (request, response) {
    // const users = await request.db.collection("users").find({ email: "iyersyam@gmail.com" }).toArray();
    // console.log(users);
    response.send('API is working || Version 19:36');
});

router.post('/auth', passport.authenticate('jwt', { session: false }), function (request, response) {
        response.send(request.user);
    }
);

//==== Authentication ====//
router.post('/login', async function (request, response) {
    try {
        passport.authenticate('local', { session: false }, (err, user, info) => {
            if (err || !user) {
                return response.status(400).json({
                    message: info.message ? info.message : 'Something is not right',
                    user: user
                });
            }
            request.login(user, { session: false }, (err) => {
                if (err) {
                    response.send(err);
                }
                // generate a signed son web token with the contents of user object and return it in the response
                const token = jwt.sign(user, 'yEdKYsvHgGA3');
                return response.json({ user, token });
            });
        })(request, response);
    } catch (error) {
        return response.status(500).json({ error });
    }
});

router.post('/signup', async function (request, response) {
    try {
        // Validate that the user doesn't already exist
        const userExists = await request.db.collection("users").findOne({ email: request.body.email });
        if (userExists) {
            return response.status(400).json({ error: `User with ${request.body.email} already exists `});
        }

        // Hash the password
        const hashedPassword = await hashPassword(request.body.password);
        delete request.body.password;
        const payload = Object.assign(request.body, { password: hashedPassword });

        // Store the user
        await request.db.collection("users").insertOne(payload);

        // Login the user (TODO: Remove replication of code here)
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
                const token = jwt.sign(user, 'yEdKYsvHgGA3');
                return response.json({ user, token });
            });
        })(request, response);
    } catch (error) {
        return response.status(500).json({ error });
    }
});

module.exports = router;
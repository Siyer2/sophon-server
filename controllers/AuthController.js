const express = require("express");
const router = express.Router();
const jwt = require('jsonwebtoken');

const passport = require("passport");
const passportJWT = require("passport-jwt");

const ExtractJwt = passportJWT.ExtractJwt;
const JwtStrategy = passportJWT.Strategy;

const dbHelper = require('../services/database');
const { comparePasswords } = require('../services/helperFunctions');

const { ObjectId } = require('mongodb');

var jwtOptions = {}
jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
jwtOptions.secretOrKey = 'yEdKYsvHgGA3';

var strategy = new JwtStrategy(jwtOptions, async function (jwt_payload, next) {
    const db = await new dbHelper();
    const user = await db.collection("users").findOne({ _id: ObjectId(jwt_payload._id) });
    if (user) {
        next(null, user);
    } else {
        next(null, false);
    }
});

passport.use(strategy);

var app = express();
app.use(passport.initialize());

router.post("/login", async function (request, response) {
    try {
        if (request.body.email && request.body.password) {
            var email = request.body.email;
            var password = request.body.password;
        }
    
        const user = await request.db.collection("users").findOne({ email });
        if (!user) {
            return response.json({ error: "Email Not Found" });
        }
    
        const correctPassword = user && ((await comparePasswords(password, user.password)) === 'success' ? true : false);
        if (correctPassword) {
            var payload = { _id: user._id };
            var token = jwt.sign(payload, jwtOptions.secretOrKey);
            return response.json({ message: "Logged In Successfully", user, token: token });
        }
        else {
            return response.json({ error: "Incorrect password." });
        }
    } catch (error) {
        return response.status(500).json({ error });
    }
});

module.exports = router;
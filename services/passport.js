const passport = require('passport');
const LocalStrategy = require('passport-local');
const passportJWT = require('passport-jwt');
const JWTStrategy = passportJWT.Strategy;
const ExtractJWT = passportJWT.ExtractJwt;
const dbHelper = require('../services/database');
const { hashPassword, comparePasswords } = require('../services/helperFunctions');

// DUMMY DATA
const user = {
    _id: '5e48a37e8f48f33ff8374e68',
    email: 'iyersyam21@gmail.com',
    firstName: 'Syam',
    lastName: 'Iyer'
}

passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
},
async function (email, password, cb) {
    const db = await new dbHelper();
    const user = await db.collection("users").findOne({ email });
    const correctPassword = user && ((await comparePasswords(password, user.password)) === 'success' ? true : false);

    if (correctPassword) {
        return cb(null, user, { message: 'Logged In Successfully' });
    }
    else {
        return cb(null, false, { message: 'Incorrect email or password.' });
    }    
}));

passport.use(new JWTStrategy({
    jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
    secretOrKey: 'yEdKYsvHgGA3'
},
    function (jwtPayload, cb) {
        // TODO: Insert DB call here to determine if user has the right password
        
        /*
        //find the user in db if needed. This functionality may be omitted if you store everything you'll need in JWT payload.
        return UserModel.findOneById(jwtPayload.id)
            .then(user => {
                return cb(null, user);
            })
            .catch(err => {
                return cb(err);
            });
            */
        return cb(null, user);
    }
));
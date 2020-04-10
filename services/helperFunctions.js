const bcrypt = require('bcrypt');

module.exports = {
    hashPassword: function(plaintextPassword) {
        return new Promise((resolve, reject) => {
            try {
                const saltRounds = 10;

                bcrypt.hash(plaintextPassword, saltRounds, function (err, hash) {
                    if (err) {
                        console.log("BCRYPT EXCEPTION HASHING PASSWORD", err);
                        reject(err);
                    }

                    resolve(hash);
                });

            } catch (ex) {
                console.log("EXCEPTION HASHING PASSWORD", ex);
                reject(ex);
            }
        });
    }, 
    comparePasswords: function(passwordToCheck, actualPassword) {
        return new Promise(async (resolve, reject) => {
            try {
                const match = await bcrypt.compare(passwordToCheck, actualPassword);
                if (match) {
                    resolve("success");
                }
                else {
                    resolve("fail");
                }
            } catch (ex) {
                console.log("EXCEPTION COMPARING PASSWORDS", ex);
                reject(ex);
            }
        });
    }
}
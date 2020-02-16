const MongoClient = require('mongodb').MongoClient;
const config = require('../config');
let db = null;

class MongoDriver {
    constructor() {
        return this.getDB();
    }

    connectClient() {
        return new Promise(async (resolve, reject) => {
            try {
                console.log("connecting to", config.settings.DB_CONNECTION_STRING);
                const client = await MongoClient.connect(config.settings.DB_CONNECTION_STRING, { useNewUrlParser: true, useUnifiedTopology: true });
                db = client.db(config.settings.DB_NAME);
                console.log("Connected!");
                resolve(db);
            } catch (err) {
                console.log(err.stack)
                reject(err);
            }
        });
    }

    getDB() {
        return new Promise(async (resolve, reject) => {
            try {
                if (!db) {
                    await this.connectClient();
                }
                resolve(db);
            } catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = MongoDriver;
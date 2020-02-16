let settings = {
    DB_USER: "server", 
    DB_PASSWORD: "jxRW7pfsKWShxvZw", 
    DB_NAME: "osStag"
}

settings.DB_CONNECTION_STRING = `mongodb+srv://${settings.DB_USER}:${settings.DB_PASSWORD}@os-staging-hwulk.mongodb.net/test?retryWrites=true&w=majority`;

exports.settings = settings;
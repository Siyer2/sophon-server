let settings = {
    DB_USER: "server", 
    DB_PASSWORD: "jxRW7pfsKWShxvZw", 
    DB_NAME: "osStag", 
    SUBMISSION_BUCKET: 'student-submissions.thesophon.com', // handles submissions by students
    UPLOAD_BUCKET: 'uploads.thesophon.com', // handles questions from teachers
    ACCOUNT_PASSWORD: '4mbA49H?vdO-mIp(=nTeP*psl4*j=Vwt'
}

if (process.env.DEPLOYMENT === 'production') {
    settings.DB_CONNECTION_STRING = `mongodb+srv://${settings.DB_USER}:${settings.DB_PASSWORD}@os-staging-hwulk.mongodb.net/test?retryWrites=true&w=majority`;
    settings.ALLOWED_APP_URLS = ['http://thesophon.com', 'http://localhost:3000'];
}
else if (process.env.DEPLOYMENT === 'local') {
    settings.DB_CONNECTION_STRING = `mongodb://localhost:27017`;
    settings.ALLOWED_APP_URLS = ['http://localhost:3000'];
}
else {
    settings.DB_CONNECTION_STRING = `mongodb+srv://${settings.DB_USER}:${settings.DB_PASSWORD}@os-staging-hwulk.mongodb.net/test?retryWrites=true&w=majority`;
    settings.ALLOWED_APP_URLS = ['http://localhost:3000'];
}

exports.settings = settings;
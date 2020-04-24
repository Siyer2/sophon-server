let settings = {
    DB_USER: "server", 
    DB_PASSWORD: "jxRW7pfsKWShxvZw", 
    DB_NAME: "osStag", 
    SUBMISSION_BUCKET: 'student-submissions.thesophon.com', // handles submissions by students
    UPLOAD_BUCKET: 'uploads.thesophon.com', // handles questions from teachers
}

if (process.env.DEPLOYMENT === 'production') {
    settings.DB_CONNECTION_STRING = `mongodb+srv://${settings.DB_USER}:${settings.DB_PASSWORD}@os-staging-pl-0.hwulk.mongodb.net/test?retryWrites=true&w=majority`;
}
else {
    settings.DB_CONNECTION_STRING = `mongodb+srv://${settings.DB_USER}:${settings.DB_PASSWORD}@os-staging-hwulk.mongodb.net/test?retryWrites=true&w=majority`;
}

exports.settings = settings;
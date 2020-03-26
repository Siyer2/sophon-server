let settings = {
    DB_USER: "server", 
    DB_PASSWORD: "jxRW7pfsKWShxvZw", 
    DB_NAME: "osStag", 
    SUBMISSION_BUCKET: 'student-submissions.optricom.com', // handles submissions by students
    UPLOAD_BUCKET: 'uploads.optricom.com', // handles questions from teachers
}

settings.DB_CONNECTION_STRING = `mongodb+srv://${settings.DB_USER}:${settings.DB_PASSWORD}@os-staging-hwulk.mongodb.net/test?retryWrites=true&w=majority`;

exports.settings = settings;
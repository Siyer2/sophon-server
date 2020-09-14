let settings = {
    DB_USER: "server", 
    DB_PASSWORD: "", 
    DB_NAME: "", 
    SUBMISSION_BUCKET: 'student-submissions.thesophon.com', // handles submissions by students
    UPLOAD_BUCKET: 'uploads.thesophon.com' // handles questions from teachers
}

if (process.env.DEPLOYMENT === 'production') {
    settings.DB_CONNECTION_STRING = ``;
    settings.ALLOWED_APP_URLS = ['http://thesophon.com', 'http://localhost:3000'];
}
else if (process.env.DEPLOYMENT === 'local') {
    settings.DB_CONNECTION_STRING = `mongodb://localhost:27017`;
    settings.ALLOWED_APP_URLS = ['http://localhost:3000'];
}
else {
    settings.DB_CONNECTION_STRING = ``;
    settings.ALLOWED_APP_URLS = ['http://localhost:3000'];
}

exports.settings = settings;

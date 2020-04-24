var router = (require('express')).Router();
var EC2 = require('../services/EC2');
var net = require('net');
var AWS = require('aws-sdk');
var multiparty = require('multiparty');
var fs = require('fs');
var moment = require('moment');
var s3Zip = require('s3-zip');
var path = require('path');
var { ObjectId } = require('mongodb');
var Client = require('ssh2-sftp-client');
var sftp = new Client();
var passport = require('passport');
AWS.config.loadFromPath('./awsKeys.json');
const { Consumer } = require('sqs-consumer');
const config = require('../config');

// Lecturer creates exam; params: examName, file, application
router.post('/create', passport.authenticate('jwt', { session: false }), async function (request, response) {
    const lecturerId = request.user._id.toString();

    try {
        // Parse the request
        const parsedFormData = await parseFormData(request);
        const filePath = parsedFormData.files.file[0].path;
        const fileName = parsedFormData.files.file[0].originalFilename.replace(/ /g, "_");
        const file = fs.createReadStream(filePath);

        // Create an exam code
        const examCode = await createUniqueExamCode(request.db);

        // Upload files to S3
        const questionLocation = await uploadToS3(file, `${lecturerId}/${examCode}/${fileName}`, config.settings.UPLOAD_BUCKET);

        // Save the exam code, start up message, applications in the database
        const exam = await request.db.collection("exams").insertOne({
            lecturerId,
            examName: parsedFormData.fields.examName[0],
            examCode,
            application: parsedFormData.fields.applicationId[0], 
            questionLocation: questionLocation, 
            time: moment().utc().format()
        });

        // Return the exam code
        return response.json({ exam: exam.ops[0] });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Student enters exam
router.post('/enter', async function (request, response) {
    try {
        const examCode = request.body.examCode;
        const studentId = request.body.studentId;

        // Get the exam (including applications and startup message)
        const exam = await request.db.collection("exams").findOne({ examCode: examCode, $or: [{ isClosed: false }, { isClosed: { $exists: false } }] });
        if (!exam) {
            return response.status(200).json({ error: `Couldn't find an open exam with code ${examCode}` });
        }

        // Check that there isn't another student with the same ID already in the exam
        const alreadyEnteredExam = await request.db.collection("examEntrances").findOne({ examCode, studentId });
        if (alreadyEnteredExam) {
            return response.status(200).json({ error: `${studentId} has already entered this exam` });
        }

        // Get the right AMI for the application
        const AMI = (await request.db.collection("applications").findOne({ _id: ObjectId(exam.application) })).AMIId;

        // Start a new EC2 and return it's IP address
        const tags = [
            {
                Key: "ExamCode",
                Value: examCode
            },
            {
                Key: "StudentId",
                Value: studentId
            }
        ];
        const createEC2 = await EC2.createEC2s(1, tags, AMI);
        const instanceId = createEC2.Instances[0].InstanceId;

        // Wait till running
        const runningEC2 = (await EC2.waitFor("instanceRunning", instanceId)).Reservations[0].Instances[0];
        console.log("Instance running...");

        // Get the public IP address
        const targetHost = runningEC2.PublicIpAddress;

        // Upload the lecturers files to the instance
        const uploadingProgress = await updateInstanceWithLecturersQuestions(exam.lecturerId, examCode, targetHost);
        if (uploadingProgress.status === 'error') {
            return response.status(400).json({ error: uploadingProgress.error });
        }
        console.log("Finished pushing all files");

        // Store the student entrance in Mongo
        const examEntrance = await request.db.collection("examEntrances").insertOne({
            ip: targetHost,
            examId: String(exam._id),
            studentId,
            examCode,
            startTime: moment().utc().format(),
            instanceId
        });

        return response.json({ status: 'ready', examEntranceId: examEntrance.ops[0]._id.toString() });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Lists lecturer's exams
router.get('/list', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const exams = await request.db.collection("exams").find({ lecturerId: request.user._id.toString() }).toArray();

        return response.json({ exams });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// List students in an exam
router.post('/studentlist', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const examId = request.body.examId;
        const students = await request.db.collection("examEntrances").find({ examId: String(examId) }).toArray();

        return response.json({ students });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Lecturer downloads students submission folder
router.post('/download', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const submissionLocation = request.body.submissionLocation;
        const s3 = new AWS.S3();

        const s3Objects = await s3
            .listObjectsV2({ Bucket: config.settings.SUBMISSION_BUCKET, Prefix: submissionLocation })
            .promise();

        const filesArray = s3Objects.Contents.map((file) => {
            const filename = path.basename(file.Key);
            return filename;
        });

        response.set('content-type', 'application/zip');
        response.header('Content-Disposition', `attachment; filename="student.zip"`);

        s3Zip
            .archive({ s3: s3, bucket: config.settings.SUBMISSION_BUCKET }, submissionLocation, filesArray)
            .pipe(response)


    } catch (error) {
        console.log("error", error);
        return response.status(500).json({ error });
    }
});

// List available applications
router.get('/applications', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const applications = await request.db.collection("applications").aggregate([
            {
                '$project': {
                    'AMIId': 0
                }
            }
        ]).toArray();

        return response.json({ applications });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Lecturer closes or opens an exam
router.post('/toggleClose', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const examId = request.body.examId;
        const exam = await request.db.collection("exams").findOne({ _id: ObjectId(examId) });
        const isClosed = exam.isClosed ? exam.isClosed : false;

        await request.db.collection("exams").updateOne(
            { _id: ObjectId(examId) }, 
            { $set: { isClosed: !isClosed }}
        );

        return response.json({ status: `${!isClosed === true ? "Closed" : "Opened"} exam with ID ${examId}` });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Lecturer deletes an exam
router.post('/delete', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const examCode = (await request.db.collection("exams").findOne({ _id: ObjectId(request.body.examId) })).examCode;

        // Empty the lecturer's questions from S3
        await emptyS3Directory(config.settings.UPLOAD_BUCKET, `${request.user._id.toString()}/${examCode}`);
        
        // Empty the student's submissions from S3 
        await emptyS3Directory(config.settings.SUBMISSION_BUCKET, `${request.user._id.toString()}/${examCode}`);

        // Delete the exam
        await request.db.collection("exams").deleteOne({ _id: ObjectId(request.body.examId) });

        return response.send("success");
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// TODO: Remove the following endpoint
router.ws('/enter', async function(client, request) {
    const examCode = request.body.examCode ? request.body.examCode : 'SYAM1203';
    const studentId = request.body.studentId ? request.body.studentId  : 'z0000000';
    const userId = request.user._id;

    // Get the exam (including applications and startup message)
    const exam = await request.db.collection("exams").findOne({ examCode: examCode });
    if (!exam) {
        client.close(400, `No exam found for code ${examCode}`);
    }

    const tags = [
        {
            Key: "ExamCode",
            Value: examCode
        },
        {
            Key: "StudentId",
            Value: studentId
        }
    ];

    // Start a new EC2 and return it's IP address
    const createEC2 = await EC2.createEC2s(1, exam, tags);
    const instanceId = createEC2.Instances[0].InstanceId;

    // Wait till running
    const runningEC2 = (await EC2.waitFor("instanceRunning", instanceId)).Reservations[0].Instances[0];

    // Get the public IP address
    const target_host = runningEC2.PublicIpAddress;

    // Wait for the scripts to install
    await waitForScriptsToLoad(instanceId);

    // Start the proxy server
    onConnectedCallback = null,
    onDisconnectedCallback = null;
    const target_port = 5901;

    console.log(`Connecting to ${target_host}:${target_port}...`);
    console.log(`Password: ${instanceId.substring(0, 8)}`);

    var target = net.createConnection(target_port, target_host, function () {
        if (onConnectedCallback) {
            try {
                onConnectedCallback(client, target);
            } catch (e) {
                console.log("onConnectedCallback failed, cleaning up target");
                target.end();
            }
        }
    });

    target.on('data', function (data) {
        try {
            client.send(data);
        } catch (e) {
            console.log("Client closed, cleaning up target");
            target.end();
        }
    });
    target.on('end', function () {
        console.log('target disconnected');
        client.close();
    });
    target.on('error', function () {
        console.log('target connection error');
        target.end();
        client.close();
    });

    client.on('message', function (msg) {
        target.write(msg);
    });
    client.on('close', function (code, reason) {

        if (onDisconnectedCallback) {
            try {
                onDisconnectedCallback(client, code, reason);
            } catch (e) {
                console.log("onDisconnectedCallback failed");
            }
        }

        console.log('WebSocket client disconnected: ' + code + ' [' + reason + ']');
        target.end();
    });
    client.on('error', function (a) {
        console.log('WebSocket client error: ' + a);
        target.end();
    });
});

//== Test Endpoints ==//
router.get('/submit', async function (request, response) {
    try {
        const directory = 'z5113480_i09'; // TODO: Make this dynamic based on their student id or some unique concat
        await getStudentSubmission('54.252.243.233', directory);

        return response.send("success");
    } catch (error) {
        return response.status(500).json({ error });
    }
});
//== End Test Endpoints ==//

//== Helper Functions ==//
// Push the lecturers question files to the running instance
function updateInstanceWithLecturersQuestions(lecturerId, examCode, instanceId) {
    return new Promise(async(resolve, reject) => {
        try {
            var s3 = new AWS.S3({
                apiVersion: '2006-03-01'
            });
            var listParams = {
                Bucket: config.settings.UPLOAD_BUCKET,
                Prefix: `${lecturerId}/${examCode}/`
            }
            s3.listObjectsV2(listParams, async function (err, data) {
                if (err) {
                    console.log("AWS ERROR LISTING OBJECTSV2", err);
                    resolve({ status: "error", error: err });
                }
                else {
                    const promises = data.Contents.map((file) => {
                        return new Promise(async (resolve, reject) => {
                            try {
                                // Get the object
                                s3.getObject({
                                    Bucket: config.settings.UPLOAD_BUCKET,
                                    Key: file.Key
                                }, function (err, data) {
                                    if (err) {
                                        console.log("AWS ERROR GETTING OBJECT", err);
                                        reject(err);
                                    }
                                    else {
                                        // Add to the files array
                                        if (data.Body) {
                                            console.log(file.Key);
                                            resolve({ file: data.Body, filename: file.Key.substring(file.Key.lastIndexOf("/") + 1) });
                                        }
                                    }
                                });
                            } catch (ex) {
                                reject("EXCEPTION GETTING OBJECT", ex);
                            }
                        });
                    });
    
                    const files = await Promise.all(promises);
                    await pushFilesToInstance(instanceId, files);
                    resolve({ "status": "success" });
                }
            });
        } catch (error) {
            console.log("ERROR updateInstanceWithLecturersQuestions", error);
            reject({ status: "error", error })
        }
    })
}
function parseFormData(request) {
    return new Promise(async (resolve, reject) => {
        try {
            var form = new multiparty.Form();
            form.parse(request, function (err, fields, files) {
                if (err) {
                    console.log("MULTIPARTY ERROR PARSING FORM", err);
                    reject(err);
                }
                else {
                    resolve({ fields, files });
                }
            });
        } catch (error) {
            console.log("ERROR PARSING FORM", error);
            reject(error);
        }
    });
}

function uploadToS3(file, filepath, bucket) {
    return new Promise(async (resolve, reject) => {
        try {
            var s3 = new AWS.S3({
                apiVersion: '2006-03-01',
                params: {
                    Bucket: bucket
                }
            });
            
            const uploadParams = {
                Bucket: bucket,
                Key: filepath,
                Body: file
            }

            s3.upload(uploadParams, function (err, data) {
                if (err) {
                    console.log("AWS ERROR UPLOADING TO S3", err);
                } if (data) {
                    resolve(data.Location);
                }
            });  
        } catch (ex) {
            console.log("EXCEPTION UPLOADING TO S3", ex);
            reject(ex);
        }
    });
}

// Upload the lecturer's questions to a running instance
var activeSFTPConnection = false;
function pushFilesToInstance(publicIpAddress, files) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Attempting connection to instance...", publicIpAddress);
            sftp.connect({
                host: publicIpAddress,
                username: 'Administrator',
                password: '4mbA49H?vdO-mIp(=nTeP*psl4*j=Vwt',
                port: '22', 
                tryKeyboard: true
            }).then(() => {
                activeSFTPConnection = true;
                console.log("Connected to instance", publicIpAddress);
                try {
                    files.map(async (file) => {
                        // Push to remote desktop
                        if (file.filename && file.file) {
                            await sftp.put(file.file, `C:/Users/DefaultAccount/Desktop/${file.filename}`);
                            console.log(`Successfully pushed ${file.filename}`);
                        }
                    });
                    activeSFTPConnection = false;
                    if (!activeSFTPConnection) {
                        sftp.end();
                    }

                    sftp.on('error', error => {
                        console.log(error);
                    });

                    resolve();
                } catch (ex) {
                    console.log("SFTP EXCEPTION PUSHING FILES TO INSTANCE", ex);
                }

            }).catch((err) => {
                console.log("ERROR PUSHING FILES TO INSTANCE", err);
                reject(err);
            });
        } catch (ex) {
            reject(ex);
            console.log("EXCEPTION PUSHING FILES TO INSTANCE", ex);
        }
    });
}

function getStudentSubmission(publicIpAddress, directory) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Attempting connection to instance...", publicIpAddress);
            sftp.connect({
                host: publicIpAddress,
                username: 'Administrator',
                password: '%WuzAjXxMQeXpU.jK&;Z)6Bn8BSC8C6p',
                port: '22'
            }).then(() => {
                return sftp.list('C:/Users/DefaultAccount/Desktop/submit');
            }).then((data) => {
                len = data.length;
                data.forEach(x => {
                    let remoteFilePath = 'C:/Users/DefaultAccount/Desktop/submit/' + x.name;
                    sftp.get(remoteFilePath).then(async (stream) => {
                        let file = `${directory}/${x.name}`;

                        // Save the submission in S3
                        await uploadToS3(stream, file, config.settings.SUBMISSION_BUCKET);
                    });
                });

                sftp.on('error', error => {
                    console.log(error);
                });

                resolve();
            }).catch((err) => {
                console.log(err, 'catch error');
                reject(err);
            });
        } catch (ex) {
            reject(ex);
            console.log("EXCEPTION GETTING SUBMIT FOLDER", ex);
        }
    });
}

function createUniqueExamCode(db) {
    return new Promise(async (resolve, reject) => {
        try {
            // Create a code
            const code = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 8);

            // Check if it's unique
            const codeExists = await db.collection('exams').findOne({ examCode: code });
            if (codeExists) {
                createUniqueExamCode(db);
            }
            else {
                resolve(code);
            }
        } catch (ex) {
            console.log("EXCEPTION CREATING UNIQUE EXAM CODE");
            reject(ex);
        }
    });
}

function waitForScriptsToLoad(instanceId) {
    return new Promise(async (resolve, reject) => {
        try {
            const queueUrl = 'https://sqs.ap-southeast-2.amazonaws.com/149750655235/scriptUpdates';
            const app = Consumer.create({
                queueUrl: queueUrl,
                handleMessage: async (message) => {
                    if (message.Body.toString() === instanceId) {
                        console.log("Finished loading scripts", message.Body);
                        resolve(message);
                    }
                },
                sqs: new AWS.SQS()
            });

            app.start();
        } catch (ex) {
            console.log("EXCEPTION waiting for scripts to load", ex);
            reject(ex);
        }
    });
}

async function emptyS3Directory(bucket, dir) {
    const listParams = {
        Bucket: bucket,
        Prefix: dir
    };

    const s3 = new AWS.S3();
    const listedObjects = await s3.listObjectsV2(listParams).promise();

    if (listedObjects.Contents.length === 0) return;

    const deleteParams = {
        Bucket: bucket,
        Delete: { Objects: [] }
    };

    listedObjects.Contents.forEach(({ Key }) => {
        deleteParams.Delete.Objects.push({ Key });
    });

    await s3.deleteObjects(deleteParams).promise();

    if (listedObjects.IsTruncated) await emptyS3Directory(bucket, dir);
}
//== End Helper Functions ==//

module.exports = router;
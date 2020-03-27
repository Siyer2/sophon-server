var router = (require('express')).Router();
var EC2 = require('../services/EC2');
var net = require('net');
var AWS = require('aws-sdk');
var multiparty = require('multiparty');
var fs = require('fs');
var moment = require('moment');
var { ObjectId } = require('mongodb');
var Client = require('ssh2-sftp-client');
var sftp = new Client();
AWS.config.loadFromPath('./awsKeys.json');
const { Consumer } = require('sqs-consumer');
const config = require('../config');

// Lecturer creates exam; params: examName, file, application
router.post('/create', async function(request, response) {
    const lecturerId = "SYAM-ADMIN"; // change to request.user._id in prod

    try {
        // Parse the request
        const parsedFormData = await parseFormData(request);
        const filePath = parsedFormData.files.file[0].path;
        const fileName = parsedFormData.files.file[0].originalFilename;
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
            application: parsedFormData.fields.application[0], 
            questionLocation: questionLocation, 
            time: moment().utc().format()
        });

        // Return the exam code
        return response.json({ message: exam.ops[0] });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

router.ws('/enter', async function(client, request) {
    const examCode = request.body.examCode ? request.body.examCode : 'SYAM1203';
    const studentId = request.body.studentId ? request.body.studentId  : 'z0000000';

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

//==== Test functions ====//
router.post('/enter', async function (request, response) {
    try {
        const examCode = request.body.examCode;
        const studentId = request.body.studentId;

        // Get the exam (including applications and startup message)
        const exam = await request.db.collection("exams").findOne({ examCode: examCode });
        if (!exam) {
            return response.status(400).json({ error: `Couldn't find exam with code ${examCode}` });
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

        // Get the public IP address
        const targetHost = runningEC2.PublicIpAddress;

        // Upload the lecturers files to the instance
        const uploadingProgress = await updateInstanceWithLecturersQuestions(exam.lecturerId, examCode, targetHost);
        if (uploadingProgress.status === 'error') {
            return response.status(400).json({ error: uploadingProgress.error });
        }

        // Store the student entrance in Mongo
        await request.db.collection("examEntrances").insertOne({
            studentId, 
            examCode,
            startTime: moment().utc().format()
        });

        return response.json({ status: 'ready' });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Push the lecturers question files to the running instance
async function updateInstanceWithLecturersQuestions(lecturerId, examCode, instanceId) {
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
                return { status: "error", error: err }
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
                return { "status": "success" };
            }
        });
    } catch (error) {
        console.log("ERROR updateInstanceWithLecturersQuestions", error);
        return { status: "error", error };
    }
}

router.get('/submit', async function (request, response) {
    try {
        const directory = 'z5113480_i09'; // TODO: Make this dynamic based on their student id or some unique concat
        await getStudentSubmission('54.252.243.233', directory);

        return response.send("success");
    } catch (error) {
        return response.status(500).json({ error });
    }
});

//== Test endpoints ==//
// This endpoint tests when a student runs an exam: lecturer uploads a question for students. 
router.post('/upload', async function(request, response) {
    const lecturerId = request.body.lecturerId;
    const examCode = request.body.examCode;

    try {
        // NOTE: in prod, this will get called when a student runs an exam
        // So this endpoint will wait for an instance to be running at this point


        

        
    } catch (error) {
        return response.status(500).json({ error });
    }
});
//== End Test Enpoint ==//

//== Helper Functions ==//
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
function pushFilesToInstance(publicIpAddress, files) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Attempting connection to instance...", publicIpAddress);
            sftp.connect({
                host: publicIpAddress,
                username: 'Administrator',
                password: '4mbA49H?vdO-mIp(=nTeP*psl4*j=Vwt',
                port: '22'
            }).then(() => {
                console.log("Connected to instance", publicIpAddress);
                try {
                    files.map(async (file) => {
                        // Push to remote desktop
                        if (file.filename && file.file) {
                            await sftp.put(file.file, `C:/Users/Administrator/Desktop/${file.filename}`);
                        }
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
                return sftp.list('C:/Users/Administrator/Desktop/submit');
            }).then((data) => {
                len = data.length;
                data.forEach(x => {
                    let remoteFilePath = 'C:/Users/Administrator/Desktop/submit/' + x.name;
                    sftp.get(remoteFilePath).then(async (stream) => {
                        let file = `${directory}/${x.name}`;

                        // Save the submission in S3
                        const savedLocation = await uploadToS3(stream, file, config.settings.SUBMISSION_BUCKET);

                        // TO-DO: Upload the saved location to mongo
                        console.log(savedLocation);
                    });
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

//== End Helper Functions ==//

module.exports = router;
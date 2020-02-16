var router = (require('express')).Router();
var EC2 = require('../services/EC2');
var net = require('net');
var AWS = require('aws-sdk');
var passport = require('passport');
require('../services/passport');
AWS.config.loadFromPath('./awsKeys.json');
const { Consumer } = require('sqs-consumer');

// Lecturer creates exam
router.post('/create', passport.authenticate('jwt', { session: false }), async function(request, response) {
    const examName = request.body.examName;
    const applications = request.body.applications;
    const startMessage = request.body.startMessage;

    try {
        // Create an exam code
        const examCode = await createUniqueExamCode(request.db);

        // Save the exam code, start up message, applications in the database
        const exam = await request.db.collection("exams").insert({
            administratorId: request.user._id,
            examName, 
            examCode, 
            applications: applications, 
            startMessage
        });

        // Return the exam code
        return response.json({ exam: exam.ops[0] });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

router.post('/enter', passport.authenticate('jwt', { session: false }), async function(request, response) {
    const examCode = request.body.examCode;
    const studentId = request.body.studentId;
    const userId = request.user._id;
    
    const exam = await request.db.collection("exams").findOne({ examCode: examCode });
    if (!exam) {
        return response.status(400).json({ error: `No exam found for code ${examCode}` });
    }
    const applications = exam.applications;
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
    const createEC2 = await EC2.createEC2s(1, applications, tags);

    return response.send(createEC2);
});

// Lists administrator's exams
router.get('/list', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const exams = await request.db.collection("exams").find({ administratorId: String(request.user._id) }).toArray();

        return response.json({ exams });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

router.ws('/enter', async function(client, request) {
    const examCode = request.body.examCode ? request.body.examCode : 'SYAM1203';
    const studentId = request.body.studentId ? request.body.studentId  : 'z0000000';
    const userId = request.user._id;

    // Get the exam (including applications and startup message)
    const exam = await request.db.collection("exams").findOne({ examCode: examCode });
    if (!exam) {
        client.close(400, `No exam found for code ${examCode}`);
    }
    const applications = exam.applications;

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
    const createEC2 = await EC2.createEC2s(1, applications, tags);
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

module.exports = router;
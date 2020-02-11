var router = (require('express')).Router();
var EC2 = require('../services/EC2');
var net = require('net');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./awsKeys.json');
const { Consumer } = require('sqs-consumer');

router.get('/subscribe', async function(request, response) {
    try {
        // TEST (DELETE)
        const instanceId = 'i-0d4100a0f69da2f76';
        // TEST (DELETE)
        const queueUrl = 'https://sqs.ap-southeast-2.amazonaws.com/149750655235/scriptUpdates';
        const app = Consumer.create({
            queueUrl: queueUrl,
            handleMessage: async (message) => {
                console.log(message);
                const msg = JSON.parse(message.Body);

                if (msg.instanceId === instanceId) {
                    console.log('goals', msg);
                }
                else {
                    console.log('message', msg);
                }
            },
            sqs: new AWS.SQS()
        });

        app.on('error', (err) => {
            console.error(err.message);
        });

        app.on('processing_error', (err) => {
            console.error(err.message);
        });

        app.start();
    } catch (error) {
        return response.status(500).json({ error });
    }
})

// Lecturer creates exam; params: (numberOfStudents, [applications], startMessage)
router.post('/create', async function(request, response) {
    const applications = request.body.applications;
    const startMessage = request.body.startMessage;

    try {
        // Create an exam code

        // Save the exam code, start up message, applications in the database

        // Return the exam code
        return response.json({ message: "createEC2s" });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Student enters an exam
router.post('/enter', async function (request, response) {
    const examCode = request.body.examCode;
    const studentId = request.body.studentId;

    try {
        // Get the exam (including applications and startup message)
        const applications = ['libreOffice'];
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
        const publicIp = runningEC2.PublicIpAddress;
        
        // Start the proxy server

        return response.json({ publicIp, instanceId });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

router.ws('/enter', async function(client, request) {
    const examCode = request.body.examCode ? request.body.examCode : 'SYAM1203';
    const studentId = request.body.studentId ? request.body.studentId  : 'z0000000';

    // Get the exam (including applications and startup message)
    const applications = ['libreOffice'];
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

    // Wait for some time
    await sleep(60000);

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

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
} 

module.exports = router;
var router = (require('express')).Router();
var websockify = require('@maximegris/node-websockify');
const { Docker } = require('node-docker-api');
var EC2 = require('../services/EC2');

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
    try {
        // Get the required applications for the exam
        const applications = ['libreOffice']; // TO-DO: this should be pulled from the DB
        
        // Start a new EC2
        const createEC2 = await EC2.createEC2s(1, applications, examCode);

        // Take the first one and start it
        const instanceId = createEC2.Instances[0].InstanceId;

        // Wait for the instance to run
        const runningEC2 = (await EC2.waitFor("instanceRunning", instanceId)).Reservations[0].Instances[0];
        
        // Get the public IP address
        const publicIp = runningEC2.PublicIpAddress;

        // Start a ws connection
        return response.json({ ec2s: publicIp });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

module.exports = router;
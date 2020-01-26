var router = (require('express')).Router();
var websockify = require('@maximegris/node-websockify');
const { Docker } = require('node-docker-api');
var EC2 = require('../services/EC2');

// Lecturer creates exam; params: (numberOfStudents, [applications], startMessage)
router.post('/create', async function(request, response) {
    const numberOfStudents = request.body.numberOfStudents;
    const applications = request.body.applications;
    const startMessage = request.body.startMessage;

    try {
        // Create an exam code to pass as a tag

        // Create the EC2s
        const createEC2s = await EC2.createEC2s(numberOfStudents, applications, 'ECON1203');

        // Save the exam code, start up message, applications in the database

        // Return the exam code
        return response.json({ message: createEC2s });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Student enters an exam
router.post('/enter', async function (request, response) {
    const examCode = request.body.examCode;

    try {
        // List all stopped EC2s with the examCode tag
        const ec2s = await EC2.listEC2sByTag("ExamCode", examCode);

        // Take the first one and start it
        

        // Get the public IP address 

        // Start a ws connection
        return response.json({ ec2s: ec2s.Reservations[0] ? ec2s.Reservations[0].Instances : [] });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

module.exports = router;
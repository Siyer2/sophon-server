var router = (require('express')).Router();
var websockify = require('@maximegris/node-websockify');
const { Docker } = require('node-docker-api');
var EC2 = require('../services/EC2');

// Lecturer creates exam; params: (numberOfStudents, [applications], startMessage)
router.post('/create', async function(request, response) {
    try {
        // Create an exam code to pass as a tag
        const createEC2s = await EC2.createEC2s(2, ['libreOffice'], 'TAGGED BY SYAM2');

        // Save the exam code, start up message, applications in the database

        // Return the exam code
        return response.json({ message: createEC2s });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Student enters an exam
router.post('/enter', async function (request, response) {
    try {
        const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    
        // Concurrently run the docker container (bare OS) AND search what applications are required
        const createdContainer = await docker.container.create({ 
            Image: 'kaixhin/vnc', 
            PublishAllPorts: true
        });
        await createdContainer.start();
        const port = (await createdContainer.status()).data.NetworkSettings.Ports['5901/tcp'][0].HostPort;

        // Add the required applications to the OS
        await runCommand(createdContainer, ['sh', '-c', 'apt-get update && apt-get install libreoffice -y --fix-missing']);

        // Run the proxy server
        websockify({ source: `localhost:5901`, target: `localhost:${port}` });
        
        response.send('success');
    } catch (error) {
        return response.status(500).json({ error });
    }
});

//==== Docker Helper functions ====//
// Run command on container
function runCommand(container, command) {
    console.log("beginning command", command);
    const promisifyStream = stream => new Promise((resolve, reject) => {
        stream.on('data', data => console.log(data.toString()))
        stream.on('end', resolve)
        stream.on('error', reject)
    });

    return new Promise(async (resolve, reject) => {
        try {
            container.exec.create({
                AttachStdout: true,
                AttachStderr: true,
                Cmd: command, 
                Tty: true
            })
            .then(exec => {
                return exec.start({ Detach: false, Tty: true });
            })
            .then(async stream => {
                const results = await promisifyStream(stream);
                resolve(results);
            })
            .catch(error => {
                console.log("ERROR RUNNING COMMAND", error);
                reject(ex);
            });
        } catch (ex) {
            console.log("ERROR RUNNING COMMAND", ex);
            reject(ex);
        }
    });
}

module.exports = router;
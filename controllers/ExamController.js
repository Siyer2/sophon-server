var router = (require('express')).Router();
var websockify = require('@maximegris/node-websockify');
const { Docker } = require('node-docker-api');

const dummyData = {
    libreOffice: {
        commands: [
            'apt-get install libreoffice -y'
        ]
    }, 
    firefox: {
        commands: [
            'apt-get install firefox -y'
        ]
    }
}

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
        const port = (await createdContainer.status);
        console.log("port", port);

        // Add the required applications to the OS
        const applicationResult = await createdContainer.exec.create({
            AttachStdout: true,
            AttachStderr: true,
            Cmd: [
                'apt-get update', 
                'apt-get install libreoffice -y'
            ]
        });
        console.log("appRes", applicationResult);
        await applicationResult.start();

        // Run the proxy server
        //websockify({ source: 'localhost:5901', target: 'localhost:32770' });
        
        response.send('success');
    } catch (error) {
        return response.status(500).json({ error });
    }
});

//==== Docker Helper functions ====//
// Create and run docker image
function createAndRunContainer(docker) {
    return new Promise(async (resolve, reject) => {
        try {
            
        } catch (ex) {
            console.log("ERROR CREATING AND RUNNING CONTAINER");
            reject(ex);
        }
    });
}

module.exports = router;
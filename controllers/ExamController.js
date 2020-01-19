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
            PublishAllPorts: true, 
            Tty: false
        });
        await createdContainer.start();
        const port = (await createdContainer.status()).data.NetworkSettings.Ports['5901/tcp'][0].HostPort;

        // Add the required applications to the OS
        await runCommand(createdContainer, ['apt-get', 'install']);
        await runCommand(createdContainer, ['apt-get', 'install', 'libreoffice', '-y']);

        // Run the proxy server
        websockify({ source: `localhost:5901`, target: `localhost:${port}` });
        
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
                Tty: false
            })
            .then(exec => {
                return exec.start({ Detach: false });
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
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

router.post('/test', async function (request, response) {
    try {
        const docker = new Docker({ socketPath: '/var/run/docker.sock' });
        let _container;

        const promisifyStream = stream => new Promise((resolve, reject) => {
            stream.on('data', data => console.log(data.toString()))
            stream.on('end', resolve)
            stream.on('error', reject)
        });

        docker.container.create({
            Image: 'kaixhin/vnc', 
            PublishAllPorts: true, 
            name: 'test'
        })
            .then(container => container.start())
            .then(container => {
                _container = container;
                return container.exec.create({
                    AttachStdout: true,
                    AttachStderr: true,
                    Cmd: ['apt-get', 'install', 'libreoffice', '-y']
                })
            })
            .then(exec => {
                return exec.start({ Detach: false })
            })
            .then(stream => promisifyStream(stream))
            // .then(() => _container.kill())
            .catch(error => console.log(error));
        return response.json({ "done": "done" });
    } catch (error) {
        return response.status(500).json({ error });
    }
})

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

        // Add the required applications to the OS
        await runCommand(createdContainer, ['apt-get', 'install']);
        console.log("end command 1");
        await runCommand(createdContainer, ['apt-get', 'install', 'libreoffice', '-y', '--fix-missing']);
        console.log("end command 2");

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
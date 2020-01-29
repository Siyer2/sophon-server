var AWS = require('aws-sdk');
AWS.config.loadFromPath('./awKeys.json');
const ec2 = new AWS.EC2();

const dummyData = {
    libreOffice: {
        command: 'libreoffice'
    },
    firefox: {
        command: 'firefox'
    }
}

module.exports = {
    createEC2s: function (numberOfEc2s, applications, tag) {
        return new Promise(async (resolve, reject) => {
            try {
                const script = getScript(applications);
                var params = {
                    MaxCount: numberOfEc2s,
                    MinCount: numberOfEc2s,
                    LaunchTemplate: {
                        LaunchTemplateName: 'baseOS'
                    },
                    TagSpecifications: [
                        {
                            ResourceType: "instance",
                            Tags: [
                                {
                                    Key: "ExamCode",
                                    Value: tag
                                }
                            ]
                        }
                    ], 
                    UserData: Buffer.from(script).toString('base64')
                }

                ec2.runInstances(params, function (err, data) {
                    if (err) {
                        console.log("AWS ERROR CREATING EC2 INSTANCE", err);
                        reject(err);
                    }
                    else {
                        resolve(data);
                    }
                });
            } catch (error) {
                console.log("ERROR", error);
                reject(error);
            }
        });
    },
    restartEC2: function (instanceId) {
        return new Promise(async (resolve, reject) => {
            try {
                var params = {
                    InstanceIds: [
                        instanceId
                    ]
                };
                ec2.startInstances(params, function (err, data) {
                    if (err) {
                        console.log("AWS ERROR RESTARTING EC2", err);
                        reject(err);
                    }
                    else {
                        resolve(data);
                    }
                });

            } catch (ex) {
                console.log("ERROR RESTARTING EC2", ex);
                reject(ex);
            }
        });
    },
    listEC2sByTag: function (name, tag) {
        return new Promise(async (resolve, reject) => {
            try {
                var params = {
                    Filters: [
                        {
                            Name: `tag:${name}`,
                            Values: [
                                tag
                            ]
                        }, 
                        {
                            Name: 'instance-state-name',
                            Values: [
                                'stopped'
                            ]
                        }
                    ]
                };
                
                ec2.describeInstances(params, function(err, data) {
                    if (err) {
                        console.log("AWS ERROR TO DESCRIBE EC2s BY TAG", err);
                        reject(err);
                    }
                    else {
                        resolve(data);
                    }
                })
            } catch (error) {
                console.log("ERROR LISTING EC2s BY TAG", error);
                reject(error);
            }
        })
    },
    waitForRunningEC2: function(instanceId) {
        return new Promise(async (resolve, reject) => {
            try {
                var params = {
                    Filters: [
                        {
                            Name: `instance-id`,
                            Values: [
                                instanceId
                            ]
                        }
                    ]
                };
                ec2.waitFor('instanceRunning', params, function (err, data) {
                    if (err) {
                        console.log("AWS ERROR WAITING FOR RUNNING EC2", err);
                        reject(err);
                    }
                    else {
                        resolve(data);
                    }
                });
            } catch (ex) {
                console.log("ERROR WAITING FOR RUNNING EC2", ex);
                reject(ex);
            }
        });
    }
};

function getScript(applications) {
    var applicationCommand = '';
    applications.map((application) => {
        applicationCommand += `${dummyData[application].command} `;
    });

    const userData = `#!/bin/bash
export HOME=/home/ubuntu

# VNC setup
yes | sudo apt-get update
yes | sudo apt-get upgrade
yes | sudo apt-get install --no-install-recommends ubuntu-desktop
yes | sudo apt-get install xfce4 vnc4server gnome-panel gnome-settings-daemon metacity nautilus gnome-terminal ${applicationCommand}

# Set password
sudo printf "5e6rGCmd\n5e6rGCmd\n\n" | vnc4passwd

mkdir $HOME/.vnc
cat <<EOT >> home/ubuntu/.vnc/xstartup
#!/bin/bash
startxfce4 &
EOT

chmod +x $HOME/.vnc/xstartup

# Start VNC
vnc4server

# Stop the server
sudo halt
`
    return userData;
}
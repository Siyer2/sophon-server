var AWS = require('aws-sdk');
AWS.config.loadFromPath('./ec2Keys.json');
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
                    UserData: Buffer.from(getScript(applications)).toString('base64')
                }

                ec2.runInstances(params, function (err, data) {
                    if (err) {
                        console.log("ERROR CREATING EC2 INSTANCE", err);
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
        return 'success';
    },
    terminateEC2s: function (examCode) {
        return 'success';
    },
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
#sudo halt
`
    return userData;
}
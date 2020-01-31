var AWS = require('aws-sdk');
AWS.config.loadFromPath('./awsKeys.json');
const ec2 = new AWS.EC2();

const dummyData = {
    libreOffice: {
        command: 'yes | sudo apt install libreoffice'
    },
    firefox: {
        command: 'yes | sudo apt install firefox'
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
                        LaunchTemplateName: 'gnomeBaseOS'
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
        applicationCommand += `${dummyData[application].command};`;
    });

    return applicationCommand;
}
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./awsKeys.json');
const ec2 = new AWS.EC2();
const dbHelper = require('../services/database');
ObjectId = require('mongodb').ObjectID;

module.exports = {
    createEC2s: function (numberOfEc2s, exam, tags) {
        return new Promise(async (resolve, reject) => {
            try {
                const script = await getScript(exam);
                var params = {
                    MaxCount: numberOfEc2s,
                    MinCount: numberOfEc2s,
                    LaunchTemplate: {
                        LaunchTemplateName: 'gnomeBaseOS'
                    },
                    TagSpecifications: [
                        {
                            ResourceType: "instance",
                            Tags: tags
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
    waitFor: function(desiredState, instanceId) {
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
                ec2.waitFor(desiredState, params, function (err, data) {
                    if (err) {
                        console.log("AWS ERROR WAITING FOR EC2", err);
                        reject(err);
                    }
                    else {
                        resolve(data);
                    }
                });
            } catch (ex) {
                console.log("ERROR WAITING FOR EC2", ex);
                reject(ex);
            }
        });
    }
};

function getScript(exam) {
    return new Promise(async (resolve, reject) => {
        try {
            const applicationIds = exam.applications.map((applicationId) => {
                return ObjectId(applicationId);
            });

            // Get all commands
            const db = await new dbHelper();
            const commands = await db.collection('applications').aggregate([
                {
                    '$match': {
                        '_id': {
                            '$in': applicationIds
                        }
                    }
                }, {
                    '$project': {
                        'command': 1
                    }
                }
            ]).toArray();

            // Convert from array to string
            var applicationCommand = '';
            commands.map((application) => {
                applicationCommand += `${application.command};`;
            });

            const script = `#!/bin/bash
yes | sudo apt-get update
yes | sudo apt-get upgrade

yes | sudo apt-get install gedit
echo ${exam.startMessage} >/home/ubuntu/Desktop/${exam.examName.replace(/ /g, "_")}.txt

${applicationCommand}
AWS_DEFAULT_REGION=ap-southeast-2
EC2_INSTANCE_ID=$(ec2metadata --instance-id)
AWS_DEFAULT_REGION=ap-southeast-2 AWS_ACCESS_KEY_ID=AKIASFXOVVEBZ5KOOXXF AWS_SECRET_ACCESS_KEY=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 aws sqs send-message --queue-url https://sqs.ap-southeast-2.amazonaws.com/149750655235/scriptUpdates --message-body "$EC2_INSTANCE_ID"

sudo rm /etc/sudoers.d/90-cloud-init-users

    `;
            resolve(script);
        } catch (ex) {
            console.log("EXCEPTION GETTING SCRIPT", ex);
            reject(ex);
        }
    });
}
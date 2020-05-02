var AWS = require('aws-sdk');
AWS.config.loadFromPath('./awsKeys.json');
const ec2 = new AWS.EC2();
const dbHelper = require('../services/database');
ObjectId = require('mongodb').ObjectID;

module.exports = {
    createEC2s: function (numberOfEc2s, tags, AMIId, userdata) {
        return new Promise(async (resolve, reject) => {
            try {
                var params = {
                    MaxCount: numberOfEc2s,
                    MinCount: numberOfEc2s,
                    LaunchTemplate: {
                        LaunchTemplateName: 'default'
                    },
                    ImageId: AMIId,
                    TagSpecifications: [
                        {
                            ResourceType: "instance",
                            Tags: tags
                        }
                    ], 
                    ...userdata && { UserData: Buffer.from(userdata).toString('base64') }
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

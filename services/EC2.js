var AWS = require('aws-sdk');
AWS.config.loadFromPath('./ec2Keys.json');
const ec2 = new AWS.EC2();

const dummyData = {
    libreOffice: {
        commands: [
            'apt-get update && apt-get install libreoffice -y --fix-missing'
        ]
    },
    firefox: {
        commands: [
            'apt-get install firefox -y'
        ]
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
                    ]
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
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
    createEC2s: function(numberOfEc2s, applications) {
        console.log(numberOfEc2s, applications);
        return 'success';
    },
    restartEC2: function(instanceId) {
        return 'success';
    },
    terminateEC2s: function(examCode) {
        return 'success';
    },
};
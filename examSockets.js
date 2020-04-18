
//==== Viewing Exams ====//
module.exports = function (server) {
    var io = require('socket.io')(server);
    var rdp = require('node-rdpjs');
    
    var rdpClient = null;
    
    io.on('connection', async function (client) {
        client.on('infos', function (infos) {
            const domain = `ec2-${infos.ip.replace('.', '-')}.ap-southeast-2.compute.amazonaws.com`;
            const connection = {
                domain: domain, 
                username: "DefaultAccount", 
                password: "4mbA49H?vdO-mIp(=nTeP*psl4*j=Vwt", 
                ip: infos.ip, 
                port: "3389", 
                screen: { width: 800, height: 600 }, 
                locale: "en"
            }

            if (rdpClient) {
                // clean older connection
                rdpClient.close();
            };

            rdpClient = rdp.createClient({
                domain: connection.domain,
                userName: connection.username,
                password: connection.password,
                enablePerf: true,
                autoLogin: true,
                screen: connection.screen,
                locale: connection.locale,
                logLevel: process.argv[2] || 'INFO'
            }).on('connect', function () {
                // Enter the exam
                console.log("connected");
                client.emit('rdp-connect');
            }).on('bitmap', function (bitmap) {
                client.emit('rdp-bitmap', bitmap);
            }).on('close', function () {
                // Submit the exam
                
                client.emit('rdp-close');
            }).on('error', function (err) {
                client.emit('rdp-error', err);
            }).connect(connection.ip, connection.port);
        }).on('mouse', function (x, y, button, isPressed) {
            if (!rdpClient) return;

            rdpClient.sendPointerEvent(x, y, button, isPressed);
        }).on('wheel', function (x, y, step, isNegative, isHorizontal) {
            if (!rdpClient) {
                return;
            }
            rdpClient.sendWheelEvent(x, y, step, isNegative, isHorizontal);
        }).on('scancode', function (code, isPressed) {
            if (!rdpClient) return;

            rdpClient.sendKeyEventScancode(code, isPressed);
        }).on('unicode', function (code, isPressed) {
            if (!rdpClient) return;

            rdpClient.sendKeyEventUnicode(code, isPressed);
        }).on('disconnect', function () {
            if (!rdpClient) return;

            // Submit the exam
            rdpClient.close();
        });
    });
}
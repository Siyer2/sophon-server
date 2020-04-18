
//==== Viewing Exams ====//
module.exports = function (server) {
    var io = require('socket.io')(server);
    var rdp = require('node-rdpjs');

    io.on('connection', async function (client) {
        console.log("a", client.handshake.query.studentId);
        console.log("b", client.handshake.query.examCode);


        var rdpClient = null;
        client.on('infos', function (infos) {
            if (rdpClient) {
                // clean older connection
                rdpClient.close();
            };

            rdpClient = rdp.createClient({
                domain: infos.domain,
                userName: infos.username,
                password: infos.password,
                enablePerf: true,
                autoLogin: true,
                screen: infos.screen,
                locale: infos.locale,
                logLevel: process.argv[2] || 'INFO'
            }).on('connect', function () {
                client.emit('rdp-connect');
            }).on('bitmap', function (bitmap) {
                client.emit('rdp-bitmap', bitmap);
            }).on('close', function () {
                client.emit('rdp-close');
            }).on('error', function (err) {
                client.emit('rdp-error', err);
            }).connect(infos.ip, infos.port);
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

            rdpClient.close();
        });
    });
}
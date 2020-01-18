var websockify = require('@maximegris/node-websockify');

// Concurrently run the docker container (bare OS) AND search what applications are required

// Add the required applications to the OS

// Run the proxy server
websockify({ source: 'localhost:5901', target: 'localhost:32770' });
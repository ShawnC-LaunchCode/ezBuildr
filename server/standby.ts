import { createServer } from 'http';

// Minimal Standby Server
// Used to verify Railway Platform Connectivity
// NO dependencies, NO database, NO routes.

const port = parseInt(process.env.PORT || '8080', 10);

console.log('--------------------------------');
console.log('🛑 STARTING STANDBY SERVER');
console.log('Time:', new Date().toISOString());
console.log('Port:', port);
console.log('--------------------------------');

const server = createServer((req, res) => {
    console.log(`[Standby] Request: ${req.method} ${req.url}`);

    // Handle Health Checks
    if (req.url === '/healthz' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK - Standby Server is Reachable');
        return;
    }

    res.writeHead(404);
    res.end('Standby Mode');
});

server.listen(port, '0.0.0.0', () => {
    console.log(`✅ Standby Server listening on 0.0.0.0:${port}`);
});

// Prevent immediate exit
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down...');
    server.close();
});

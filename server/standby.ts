import { createServer } from 'http';

// Minimal Standby Server
// Used to verify Railway Platform Connectivity
// NO dependencies, NO database, NO routes.

const port = parseInt(process.env.PORT ?? '8080', 10);

// eslint-disable-next-line no-console
console.log('--------------------------------');
// eslint-disable-next-line no-console
console.log('🛑 STARTING STANDBY SERVER');
// eslint-disable-next-line no-console
console.log('Time:', new Date().toISOString());
// eslint-disable-next-line no-console
console.log('Port:', port);
// eslint-disable-next-line no-console
console.log('--------------------------------');

const server = createServer((req, res) => {
    // eslint-disable-next-line no-console
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

// Log heartbeat to prove container is not frozen
setInterval(() => {
    // eslint-disable-next-line no-console
    console.log(`[Standby] Heartbeat - Server is running on port ${port} - Memory: ${process.memoryUsage().rss / 1024 / 1024} MB`);
}, 5000);

server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`✅ Standby Server listening on port ${port} (All Interfaces)`);
});

// Prevent immediate exit
process.on('SIGTERM', () => {
    // eslint-disable-next-line no-console
    console.log('SIGTERM received. Shutting down...');
    server.close();
});

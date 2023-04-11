import compression from 'compression';
import express from 'express';

import cookieParser from 'cookie-parser';


import http from 'http';
import { Server } from 'socket.io';

function startServer() {
    const app = express()
    const port = 3002

    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            // TODO: add origin for vercel app url
            origin: ['http://127.0.0.1:5173'],
            methods: ["GET", "POST"]
        }
    });

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // compress all responses
    app.use(compression());

    app.use(cookieParser());

    const userMap = {};
    const socketMap = {};

    app.get('/', (req, res) => {
        res.send('Hi! I am a game server.');
    });

    io.on('connection', (socket) => {
        console.log('a user connected');

        io.emit('chat message', 'yo!');

        socket.on('chat message', (msg) => {
            io.emit('chat message', msg);
        });

        socket.on('position', (msg) => {
            // console.log('position', msg);
            socket.broadcast.emit('position', msg);

            userMap[msg.userId] = msg;
            socketMap[socket.id] = msg.userId;
        });

        socket.on('action', (msg) => {
            console.log('action', msg);
            socket.broadcast.emit('action', msg);
        });

        socket.on('disconnect', () => {
            console.log('user disconnected');
            var userId = socketMap[socket.id];
            var user = userMap[userId];

            socket.broadcast.emit('leave', user);

            delete socketMap[socket.id];
            delete userMap[userId];
        });
    });

    server.listen(port, () => {
        console.log('listening on *:' + port);
    });
}

startServer();
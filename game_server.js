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
            origin: [
                'http://127.0.0.1:5173', 
                'http://roboparty-181954572.us-east-2.elb.amazonaws.com'
            ],
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

        socket.on('chat_message', (msg) => {
            const roomId = msg.roomId;
            io.to(roomId).emit('chat_message', msg);
        });

        socket.on('position', (msg) => {
            const roomId = msg.roomId;

            // console.log('position', msg);
            socket.to(roomId).emit('position', msg);

            if (!userMap[msg.playerId]) {
                socket.join(roomId);
            }
            userMap[msg.playerId] = msg;
            socketMap[socket.id] = msg.playerId;
        });

        socket.on('action', (msg) => {
            const roomId = msg.roomId;

            console.log('action', msg);
            socket.to(roomId).emit('action', msg);
        });

        socket.on('disconnect', () => {
            try {
                console.log('user disconnected');
                var playerId = socketMap[socket.id];
                var user = userMap[playerId];
    
                const roomId = user.roomId;
    
                socket.to(roomId).emit('leave', user);
    
                delete socketMap[socket.id];
                delete userMap[playerId];
            } catch (e) {
                console.error(e);
            }
        });
    });

    server.listen(port, () => {
        console.log('listening on *:' + port);
    });
}

startServer();
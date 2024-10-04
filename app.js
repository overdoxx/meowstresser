require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const http = require('http');
const socketIO = require('socket.io');
const Attack = require('./models/Attack');
const fetch = require('node-fetch');
const app = express();

mongoose.connect(process.env.DB_URI)
    .then(() => console.log('MongoDB Connected.'))
    .catch(err => console.log('MongoDB Error:', err));

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DB_URI }),
    cookie: {
        maxAge: 120 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict'
    }
}));
app.use(flash());
app.set('view engine', 'ejs');

const server = http.createServer(app);
const io = socketIO(server);

io.on('connection', (socket) => {
    const userCount = io.engine.clientsCount;
    io.emit('userConnected', { count: userCount });

    socket.on('joinRoom', (userId) => socket.join(userId));

    socket.on('joinAdminRoom', () => {
        socket.join('adminRoom');
    });

    socket.on('disconnect', () => {
        const userCount = io.engine.clientsCount;
        io.emit('userDisconnected', { count: userCount });
    });
});

const routes = [
    './routes/homeRoutes',
    './routes/authRoutes',
    './routes/hubRoutes',
    './routes/panelRoutes',
    './routes/attackRoutes',
    './routes/userRoutes',
    './routes/storeRoutes',
    './routes/apiManagerRoutes',
    './routes/apiAttackRoutes',
    './routes/adminRoutes'
];

routes.forEach(route => {
    const loadedRoutes = require(route);
    if (route.includes('hubRoutes')) {
        app.use('/', loadedRoutes(io));
    } else {
        app.use('/', loadedRoutes);
    }
});

const updateAttackTimes = async () => {
    try {
        const attacks = await Attack.find();
        const now = new Date();

        for (const attack of attacks) {
            const timeElapsed = (now - attack.startTime) / 1000;
            const timeLeft = attack.time - timeElapsed;

            if (timeLeft > 0) {
                io.to(attack.userId.toString()).emit('updateTime', { attackId: attack.id, timeLeft });
            } else {
                await Attack.deleteOne({ _id: attack._id });
            }
        }
    } catch (err) {
        console.error('Error updating attack times:', err);
    }
};

const SERVER_SIDE_SECRET = process.env.SERVER_SIDE_SECRET || 'your-server-side-secret';

const updateAdminAttacks = async () => {
    try {
        const response = await fetch('https://meowstresser.com/admin/active-attacks', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Server-Side-Request': SERVER_SIDE_SECRET
            }
        });

        const activeAttacks = await response.json();
        io.to('adminRoom').emit('updateAttacks', activeAttacks);
    } catch (err) {
        console.error('Error updating admin attacks:', err);
        if (err.response) {
            console.error('Response status:', err.response.status);
            console.error('Response text:', await err.response.text());
        }
    }
};

setInterval(updateAttackTimes, 500);

setInterval(updateAdminAttacks, 500);

const PORT = process.env.PORT || 80;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));


app.use((req, res, next) => {
    res.status(404).render('404'); 
  });

app.use((err, req, res, next) => {
    console.error('Global error handler:');
    console.error(err.stack);
    req.flash('message', 'A server error has occurred.');
    req.flash('messageType', 'error');
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        res.status(500).json({ error: 'A server error has occurred.' });
    } else {
        res.status(500).redirect('/login');
    }
});
const express = require('express');
const router = express.Router();
const Attack = require('../models/Attack');
const User = require('../models/User');
const ensureAuthenticated = require('../middleware/authMiddleware');

module.exports = (io) => {
    router.get('/hub', ensureAuthenticated, async(req, res) => {
        try {
            const user = await User.findOne({ username: req.session.user.username });
            if (!user) {
                req.flash('message', 'User not found.');
                req.flash('messageType', 'error');
                return res.redirect('/login');
            }
            res.render('hub', { user });
        } catch (err) {
            req.flash('message', 'Error fetching user data.');
            req.flash('messageType', 'error');
            res.redirect('/login');
        }
    });

    router.get('/api/hub-data', async(req, res) => {
        try {
            const totalUsers = await User.countDocuments();
            const users = await User.find();
            const totalAttacks = users.reduce((acc, user) => acc + user.attackCount, 0);
            const runningBoots = await Attack.countDocuments();
            const usersOnlineCount = io.engine.clientsCount;

            res.json({
                totalUsers,
                totalAttacks,
                runningBoots,
                usersOnline: usersOnlineCount
            });
        } catch (error) {
            console.error('Erro ao obter dados do hub:', error);
            res.status(500).json({ error: 'Erro ao obter dados do hub' });
        }
    });

    return router;
};
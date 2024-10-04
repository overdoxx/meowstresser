const express = require('express');
const router = express.Router();
const Attack = require('../models/Attack');
const User = require('../models/User');
const ensureAuthenticated = require('../middleware/authMiddleware');


router.get('/user-attacks', ensureAuthenticated, async(req, res) => {
    const userId = req.session.user._id;
    try {
        const attacks = await Attack.find({ userId }).sort({ startTime: -1 });
        res.json(attacks);
    } catch (error) {
        console.error('Erro ao buscar ataques do usuário:', error);
        res.status(500).send('Erro ao buscar ataques.');
    }
});

router.get('/api/concurrents', ensureAuthenticated, async(req, res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const userAttacks = await Attack.find({ userId: user._id });
        const activeConcurrents = userAttacks.length;
        const availableConcurrents = user.concurrents - activeConcurrents;

        res.json({ availableConcurrents: Math.max(0, availableConcurrents) });
    } catch (error) {
        console.error('Erro ao carregar concorrentes:', error);
        res.status(500).json({ error: 'Erro ao carregar concorrentes' });
    }
});

module.exports = router;
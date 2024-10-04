const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Attack = require('../models/Attack');
const AttackLog = require('../models/AttackLog');
const ensureAuthenticated = require('../middleware/authMiddleware');
const ensureAdmin = require('../middleware/adminMiddleware');

const SERVER_SIDE_SECRET = process.env.SERVER_SIDE_SECRET || 'your-server-side-secret';

router.get('/admin', ensureAuthenticated, ensureAdmin, async(req, res) => {
    try {
        const users = await User.find().select('-password');
        const attacks = await Attack.find().populate('userId', 'username');
        const attackLogs = await AttackLog.find().populate('userId', 'username').sort({ startTime: -1 }).limit(100);

        res.render('admin', { users, attacks, attackLogs });
    } catch (err) {
        console.error('Error fetching admin data:', err);
        req.flash('message', 'Error fetching admin data.');
        req.flash('messageType', 'error');
        res.redirect('/hub');
    }
});

router.get('/admin/active-attacks', async(req, res) => {
    try {
        const isServerSideRequest = req.get('X-Server-Side-Request') === SERVER_SIDE_SECRET;

        if (!isServerSideRequest && (!req.isAuthenticated() || !req.user.isAdmin)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const attacks = await Attack.find().populate('userId', 'username');
        const now = new Date();
        const activeAttacks = attacks.map(attack => {
            const timeElapsed = (now - attack.startTime) / 1000;
            const timeLeft = Math.max(0, attack.time - timeElapsed);
            return {
                id: attack.id,
                userId: attack.userId,
                ip: attack.ip,
                port: attack.port,
                method: attack.method,
                timeLeft: Math.round(timeLeft)
            };
        }).filter(attack => attack.timeLeft > 0);

        res.json(activeAttacks);
    } catch (err) {
        console.error('Error fetching active attacks:', err);
        res.status(500).json({ error: 'Error fetching active attacks' });
    }
});

router.post('/admin/update-user', ensureAuthenticated, ensureAdmin, async(req, res) => {
    try {
        const { userId, planName } = req.body;
        const plans = {
            'Default': { concurrents: 0, maxTime: 0 },
            'Basic 1 Plan': { concurrents: 1, maxTime: 1200 },
            'Basic 2 Plan': { concurrents: 2, maxTime: 1800 },
            'Basic 3 Plan': { concurrents: 4, maxTime: 2400 },
            'Standard 1 Plan': { concurrents: 6, maxTime: 2400 },
            'Standard 2 Plan': { concurrents: 8, maxTime: 2400 },
            'Standard 3 Plan': { concurrents: 10, maxTime: 2400 },
        };

        const plan = plans[planName];
        if (!plan) {
            return res.status(400).json({ success: false, message: 'Invalid plan name' });
        }

        await User.findByIdAndUpdate(userId, {
            planName,
            concurrents: plan.concurrents,
            maxAttackTime: plan.maxTime,
            activePlan: planName !== 'Default',
            activationDate: planName !== 'Default' ? new Date() : null
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating user plan:', err);
        res.status(500).json({ success: false, message: 'Error updating user plan' });
    }
});

module.exports = router;
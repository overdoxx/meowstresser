const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const axios = require('axios');

const registerValidation = [
    body('username')
    .isAlphanumeric().withMessage('Username must be alphanumeric.')
    .isLength({ min: 3, max: 20 }).withMessage('Username must be between 3 and 20 characters.'),
    body('password')
    .isLength({ min: 6 }).withMessage('Password must have at least 6 characters.')
    .matches(/\d/).withMessage('Password must contain at least one number.')
];

async function verifyCaptcha(token) {
    const secret = '0x4AAAAAAAkkuwJhqox7xNCR1qnwvwC39Ts';
    const response = await axios.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        `secret=${secret}&response=${token}`, {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
            },
        }
    );
    return response.data.success;
}

router.post('/register', registerValidation, async(req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => error.msg).join('<br>');
        req.flash('message', errorMessages);
        req.flash('messageType', 'error');
        return res.redirect('/login');
    }

    const { username, password, 'cf-turnstile-response': captchaToken } = req.body;

    try {
        const captchaValid = await verifyCaptcha(captchaToken);
        if (!captchaValid) {
            req.flash('message', 'CAPTCHA verification failed. Please try again.');
            req.flash('messageType', 'error');
            return res.redirect('/login');
        }

        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (existingUser) {
            req.flash('message', 'The username already exists. Choose another.');
            req.flash('messageType', 'error');
            return res.redirect('/login');
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const newUser = new User({
            username,
            password: hashedPassword,
            concurrents: 0,
            maxAttackTime: 0,
            activePlan: false,
            activationDate: null,
            attackCount: 0,
            planName: "Default",
            isAdmin: false
        });
        await newUser.save();
        req.flash('message', 'Registration completed successfully. Log in.');
        req.flash('messageType', 'success');
        res.redirect('/login');
    } catch (err) {
        req.flash('message', 'Error registering. User may already exist.');
        req.flash('messageType', 'error');
        res.redirect('/login');
    }
});

router.post('/login', async(req, res) => {
    const { username, password, 'cf-turnstile-response': captchaToken } = req.body;
    try {
        const captchaValid = await verifyCaptcha(captchaToken);
        if (!captchaValid) {
            req.flash('message', 'CAPTCHA verification failed. Please try again.');
            req.flash('messageType', 'error');
            return res.redirect('/login');
        }

        const user = await User.findOne({ username });
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.user = user;
            req.flash('message', 'Login successful.');
            req.flash('messageType', 'success');
            return res.redirect('/login?redirect=true');
        } else {
            req.flash('message', 'Incorrect username or password');
            req.flash('messageType', 'error');
            return res.redirect('/login');
        }
    } catch (err) {
        req.flash('message', 'Server error');
        req.flash('messageType', 'error');
        res.redirect('/login');
    }
});

router.get('/login', (req, res) => {
    const message = req.flash('message');
    const messageType = req.flash('messageType') || 'info';
    const redirect = req.query.redirect === 'true';
    res.render('login', { message, messageType, redirect });
});

router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Erro ao encerrar a sessão.');
        }
        res.send('Sessão encerrada com sucesso.');
    });
});

module.exports = router;
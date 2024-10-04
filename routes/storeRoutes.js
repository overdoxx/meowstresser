const express = require('express');
const router = express.Router();
const ensureAuthenticated = require('../middleware/authMiddleware');
const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/User');

const API_KEY = process.env.NOWPAYMENTS_API_KEY || '2659W44-K4WMXC2-Q17C98K-9Q26316';
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || 'FSd20fJUdcj05ABDZ5IXQ1JEGUttJlg1';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1290424779387703347/1edYfIr5POkTsYKZMv5mAy3uFNc_RRYOHvfncYlsIA9H-X6CTSr6vKQEdJdpBrxmy6ni';

const nowpaymentsApi = axios.create({
    baseURL: 'https://api.nowpayments.io/v1/',
    headers: {
        'x-api-key': API_KEY,
    },
});

async function sendDiscordNotification(paymentData) {
    const embed = {
        title: `IPN-CALLBACK: ${paymentData.order_id}`,
        description: `Status do pagamento: **${paymentData.payment_status}**\n
        Valor: **${paymentData.pay_amount} ${paymentData.pay_currency}**\n
        Cliente: **${paymentData.username}**\n
        Plano: **${paymentData.order_id}**`,
        color: paymentData.payment_status === 'finished' ? 3066993 : 15158332,
        timestamp: new Date(),
    };

    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [embed],
        });
        console.log('Notificação enviada ao Discord com sucesso.');
    } catch (error) {
        console.error('Erro ao enviar notificação para o Discord:', error.message);
    }
}

router.get('/store', ensureAuthenticated, (req, res) => {
    res.render('store', { user: req.session.user });
});

router.post('/checkout', ensureAuthenticated, (req, res) => {
    const { planName, planPrice, concurrents, maxTime } = req.body;
    res.render('checkout', {
        user: req.session.user,
        plan: { name: planName, price: planPrice, concurrents, maxTime }
    });
});

router.post('/create-payment', ensureAuthenticated, async(req, res) => {
    try {
        const { planName, planPrice, crypto: selectedCrypto } = req.body;
        const orderId = generateOrderId();

        const response = await nowpaymentsApi.post('payment', {
            price_amount: planPrice,
            price_currency: 'usd',
            pay_currency: selectedCrypto,
            order_id: orderId,
            order_description: `Payment for ${planName}: ${req.session.user.username}`,
            ipn_callback_url: `${process.env.BASE_URL}/ipn-callback`,
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error creating payment:', error.message);
        res.status(500).json({ error: 'Failed to create payment', details: error.message });
    }
});

router.get('/check-payment-status/:paymentId', ensureAuthenticated, async(req, res) => {
    try {
        const response = await nowpaymentsApi.get(`payment/${req.params.paymentId}`);
        res.json(response.data);
    } catch (error) {
        console.error('Error checking payment status:', error.message);
        res.status(500).json({ error: 'Failed to check payment status', details: error.message });
    }
});

function verifyIPNSignature(ipnData, ipnSignature) {
    const hmac = crypto.createHmac('sha512', IPN_SECRET);
    hmac.update(ipnData, 'utf8');
    const calculatedSignature = hmac.digest('hex');
    return calculatedSignature === ipnSignature;
}

router.post('/ipn-callback', express.json(), async(req, res) => {
    try {
        const ipnSignature = req.headers['x-nowpayments-sig'];
        const ipnData = JSON.stringify(req.body);

        if (!verifyIPNSignature(ipnData, ipnSignature)) {
            console.error('Invalid IPN signature');
            return res.status(400).send('Invalid IPN signature');
        }

        const {
            payment_id,
            payment_status,
            pay_address,
            price_amount,
            price_currency,
            pay_amount,
            pay_currency,
            order_id,
            order_description
        } = req.body;

        console.log(`Received IPN for payment ${payment_id}, status: ${payment_status}`);

        const username = order_description.split(':')[1].trim();
        const user = await User.findOne({ username });

        if (!user) {
            console.error(`User not found for payment ${payment_id}`);
            return res.status(404).send('User not found');
        }

        user.paymentHistory.push({
            paymentId: payment_id,
            planName: order_id,
            amount: pay_amount,
            currency: pay_currency,
            status: payment_status,
            date: new Date()
        });

        if (payment_status === 'finished' || payment_status === 'confirmed') {
            user.activePlan = true;
            user.activationDate = new Date();
            user.planName = order_id;

            switch (order_id) {
                case 'Basic Plan':
                    user.concurrents = 3;
                    user.maxAttackTime = 1200;
                    break;
                case 'Standard Plan':
                    user.concurrents = 12;
                    user.maxAttackTime = 2400;
                    break;
                case 'Pro Plan':
                    user.concurrents = 24;
                    user.maxAttackTime = 3600;
                    break;
                case 'Business Plan':
                    user.concurrents = 48;
                    user.maxAttackTime = 5400;
                    break;
                case 'Enterprise Plan':
                    user.concurrents = 96;
                    user.maxAttackTime = 7200;
                    break;
                case 'Ultimate Plan':
                    user.concurrents = 240;
                    user.maxAttackTime = 10800;
                    break;
                default:
                    console.error(`Unknown plan: ${order_id}`);
            }

            console.log(`Activated ${order_id} for user ${username}`);
        } else if (payment_status === 'failed' || payment_status === 'expired') {
            console.log(`Payment ${payment_id} for user ${username} has ${payment_status}`);
        }

        await user.save();

        await sendDiscordNotification({
            payment_id,
            payment_status,
            pay_amount,
            pay_currency,
            order_id,
            username
        });

        res.status(200).send('IPN Received');
    } catch (error) {
        console.error('Error processing IPN:', error);
        res.status(500).send('Error processing IPN');
    }
});

router.get('/payment-success', ensureAuthenticated, (req, res) => {
    res.render('payment-success', { user: req.session.user });
});

function generateOrderId() {
    return 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

module.exports = router;
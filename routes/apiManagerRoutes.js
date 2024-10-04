const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ensureAuthenticated = require('../middleware/authMiddleware');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

router.get('/api', ensureAuthenticated, async(req, res) => {
    const user = await User.findById(req.session.user._id);

    const methodsPath = path.join(__dirname, '../methods.json');
    const methods = JSON.parse(fs.readFileSync(methodsPath, 'utf8'));

    const transformedMethods = methods.map(method => ({
        method: method.methodName,
        protocol: `${method.layer}`,
        type: method.type
    }));

    const page = parseInt(req.query.page) || 1;
    const perPage = 10;
    const totalPages = Math.ceil(transformedMethods.length / perPage);
    const paginatedMethods = transformedMethods.slice((page - 1) * perPage, page * perPage);

    const fields = [
        { parameter: "key", type: "String", description: "Token to authenticate with the API", value: user.apiToken || 'See API Manager', required: true },
        { parameter: "host", type: "String", description: "Target IP/Subnet Range or URL", value: "0.0.0.0,0.0.0.0/24 or https://example.com/", required: true },
        { parameter: "port", type: "Integer", description: "Destination port, 0 for randomized ports", value: "80, 443, 8080", required: false },
        { parameter: "time", type: "Integer", description: "Attack duration in seconds", value: "60, 120, 300", required: true },
        { parameter: "method", type: "String", description: "Attack method", value: "See Available Methods", required: true }
    ];

    res.render('apiManager', { fields, methods: paginatedMethods, user, page, totalPages });
});

router.get('/api/methods', ensureAuthenticated, async(req, res) => {
    const methodsPath = path.join(__dirname, '../methods.json');
    const methods = JSON.parse(fs.readFileSync(methodsPath, 'utf8'));

    const transformedMethods = methods.map(method => ({
        method: method.methodName,
        protocol: `${method.layer}`,
        type: method.type
    }));

    const page = parseInt(req.query.page) || 1;
    const perPage = 10;
    const paginatedMethods = transformedMethods.slice((page - 1) * perPage, page * perPage);

    res.json(paginatedMethods);
});

router.post('/generate-api-key', ensureAuthenticated, async(req, res) => {
    const user = await User.findById(req.session.user._id);

    if (!user.activePlan) {
        return res.status(403).json({ message: 'You don\'t have an active plan.' });
    }

    user.apiToken = uuidv4();
    await user.save();

    return res.status(200).json({ message: 'API key generated successfully.', apiToken: user.apiToken });
});

router.post('/disable-api-key', ensureAuthenticated, async(req, res) => {
    const user = await User.findById(req.session.user._id);

    if (!user.apiToken) {
        return res.status(400).json({ message: 'You do not have an API key to disable.' });
    }

    user.apiToken = null;
    await user.save();

    return res.status(200).json({ message: 'API key disabled successfully.' });
});

module.exports = router;
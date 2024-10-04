const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const ensureAuthenticated = require('../middleware/authMiddleware');

const methodsFilePath = path.join(__dirname, '../methods.json');
let methods = [];

fs.readFile(methodsFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error("Error reading methods.json", err);
        return;
    }
    methods = JSON.parse(data);
});

function getMethodsByLayer(layer) {
    return methods
        .filter(method => method.layer === layer)
        .reduce((acc, method) => {
            if (!acc[method.type]) {
                acc[method.type] = [];
            }
            acc[method.type].push({
                methodName: method.methodName,
                apis: method.apis
            });
            return acc;
        }, {});
}

router.get('/panel', ensureAuthenticated, (req, res) => {
    const layer4Methods = getMethodsByLayer(4);
    const layer7Methods = getMethodsByLayer(7);
    res.render('panel', {
        user: req.session.user,
        layer4Methods,
        layer7Methods,
        methods
    });
});

module.exports = router;
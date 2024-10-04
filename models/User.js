const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    concurrents: { type: Number, default: 0 },
    maxAttackTime: { type: Number, default: 0 },
    activePlan: { type: Boolean, default: false },
    activationDate: { type: Date, default: null },
    attackCount: { type: Number, default: 0 },
    planName: { type: String, default: "Default" },
    isAdmin: { type: Boolean, default: false },
    apiToken: { type: String, default: null },
    paymentHistory: [{
        paymentId: String,
        planName: String,
        amount: Number,
        currency: String,
        status: String,
        date: Date
    }]
});

module.exports = mongoose.model('User', userSchema);
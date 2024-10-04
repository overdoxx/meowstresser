const mongoose = require('mongoose');

const ApiAttackSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  api: {
    type: String,
    required: true
  },
  ip: {
    type: String,
    required: true
  },
  port: {
    type: String,
    required: true
  },
  method: {
    type: String,
    required: true
  },
  time: {
    type: Number,
    required: true
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attackId: {
    type: String
  }
});

module.exports = mongoose.model('ApiAttack', ApiAttackSchema);

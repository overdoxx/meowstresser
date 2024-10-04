const mongoose = require('mongoose');

const attackLogSchema = new mongoose.Schema({
  id: String,
  api: String,
  ip: String,
  port: Number,
  concurrents: Number,
  method: String,
  time: Number,
  startTime: Date,
  userId: {type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true},
  layer: String,
});

module.exports = mongoose.model('AttackLog', attackLogSchema);

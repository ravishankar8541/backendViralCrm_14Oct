const mongoose = require('mongoose');
const { MAX_SERVICE_NAME_LENGTH, normalizeServiceName, serviceNameKey } = require('../utils/serviceNames');

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: MAX_SERVICE_NAME_LENGTH, set: normalizeServiceName },
  normalizedName: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

serviceSchema.pre('validate', function () {
  if (typeof this.name === 'string') this.normalizedName = serviceNameKey(this.name);
});

module.exports = mongoose.model('Service', serviceSchema);

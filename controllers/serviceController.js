const Service = require('../models/Service');
const { isObjectIdOrHexString } = require('mongoose');
const {
  DEFAULT_SERVICE_NAMES, MAX_SERVICE_NAME_LENGTH, normalizeServiceName, serviceNameKey,
} = require('../utils/serviceNames');

exports.getServices = async (req, res) => {
  try {
    const saved = await Service.find().select('name').sort({ name: 1 }).lean();
    const names = new Map(DEFAULT_SERVICE_NAMES.map(name => [serviceNameKey(name), name]));
    for (const { name } of saved) {
      if (!names.has(serviceNameKey(name))) names.set(serviceNameKey(name), name);
    }
    const customServices = saved
      .filter(({ name }) => !DEFAULT_SERVICE_NAMES.some(item => serviceNameKey(item) === serviceNameKey(name)))
      .map(({ _id, name }) => ({ id: _id, name }));
    return res.status(200).json({ success: true, data: [...names.values()], customServices });
  } catch (error) {
    console.error('Failed to load services:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load services. Please try again.' });
  }
};

exports.createService = async (req, res) => {
  if (typeof req.body?.name !== 'string') {
    return res.status(400).json({ success: false, message: 'Service name is required.' });
  }
  const name = normalizeServiceName(req.body.name);
  if (!name || name.length > MAX_SERVICE_NAME_LENGTH) {
    return res.status(400).json({ success: false, message: `Service name must be between 1 and ${MAX_SERVICE_NAME_LENGTH} characters.` });
  }
  const normalizedName = serviceNameKey(name);
  const defaultName = DEFAULT_SERVICE_NAMES.find(item => serviceNameKey(item) === normalizedName);
  if (defaultName) {
    return res.status(200).json({ success: true, created: false, data: { name: defaultName } });
  }

  try {
    const existing = await Service.findOne({ normalizedName });
    if (existing) {
      return res.status(200).json({ success: true, created: false, data: { id: existing._id, name: existing.name } });
    }
    const service = await Service.create({ name, normalizedName, createdBy: req.user.id });
    return res.status(201).json({ success: true, created: true, data: { id: service._id, name: service.name } });
  } catch (error) {
    // Concurrent requests for the same name should select the one already saved.
    if (error.code === 11000) {
      try {
        const existing = await Service.findOne({ normalizedName });
        if (existing) {
          return res.status(200).json({ success: true, created: false, data: { id: existing._id, name: existing.name } });
        }
      } catch (lookupError) {
        console.error('Failed to retrieve existing service:', lookupError.message);
      }
    }
    console.error('Failed to create service:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to save service. Please try again.' });
  }
};

exports.updateService = async (req, res) => {
  if (!isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid service ID.' });
  }
  if (typeof req.body?.name !== 'string') {
    return res.status(400).json({ success: false, message: 'Service name is required.' });
  }
  const name = normalizeServiceName(req.body.name);
  if (!name || name.length > MAX_SERVICE_NAME_LENGTH) {
    return res.status(400).json({ success: false, message: `Service name must be between 1 and ${MAX_SERVICE_NAME_LENGTH} characters.` });
  }
  const normalizedName = serviceNameKey(name);
  if (DEFAULT_SERVICE_NAMES.some(item => serviceNameKey(item) === normalizedName)) {
    return res.status(409).json({ success: false, message: 'A service with this name already exists.' });
  }
  try {
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, normalizedName: { $nin: DEFAULT_SERVICE_NAMES.map(serviceNameKey) } },
      { $set: { name, normalizedName } },
      { new: true, runValidators: true },
    );
    if (!service) return res.status(404).json({ success: false, message: 'Custom service not found. Refresh the service list.' });
    return res.status(200).json({ success: true, data: { id: service._id, name: service.name } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A service with this name already exists.' });
    }
    console.error('Failed to update service:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to update service. Please try again.' });
  }
};

exports.deleteService = async (req, res) => {
  if (!isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid service ID.' });
  }
  try {
    const service = await Service.findOneAndDelete({
      _id: req.params.id, normalizedName: { $nin: DEFAULT_SERVICE_NAMES.map(serviceNameKey) },
    });
    if (!service) return res.status(404).json({ success: false, message: 'Custom service not found. Refresh the service list.' });
    return res.status(200).json({ success: true, data: { id: service._id, name: service.name } });
  } catch (error) {
    console.error('Failed to delete service:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to delete service. Please try again.' });
  }
};

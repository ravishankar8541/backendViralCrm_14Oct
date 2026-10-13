const Service = require('../models/Service');
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
    return res.status(200).json({ success: true, data: [...names.values()] });
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
      return res.status(200).json({ success: true, created: false, data: { name: existing.name } });
    }
    const service = await Service.create({ name, normalizedName, createdBy: req.user.id });
    return res.status(201).json({ success: true, created: true, data: { name: service.name } });
  } catch (error) {
    // Concurrent requests for the same name should select the one already saved.
    if (error.code === 11000) {
      try {
        const existing = await Service.findOne({ normalizedName });
        if (existing) {
          return res.status(200).json({ success: true, created: false, data: { name: existing.name } });
        }
      } catch (lookupError) {
        console.error('Failed to retrieve existing service:', lookupError.message);
      }
    }
    console.error('Failed to create service:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to save service. Please try again.' });
  }
};

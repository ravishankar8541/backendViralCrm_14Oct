const DEFAULT_SERVICE_NAMES = [
  'Web Development', 'Website Renewal', 'Digital Marketing', 'SEO Optimization',
  'Domain Booking', 'App Development', 'Email Booking', 'Photo shoot', 'CataLog',
  'Videos/Reals', 'Social Media Management', 'Content Marketing', 'Pdf Browser',
  'Google Ads/PPC', 'E-commerce Solutions', 'CRM Implementation', 'Meta Ads',
  'Cybersecurity', 'AI/ML Solutions', 'Blockchain Development', 'Website (Hosting)',
  'Domain Renewal', 'Website (Hosting) Renewal', 'UI/UX Design', 'Cloud Services',
  'IT Consulting', 'Brand Strategy', 'Email Marketing', 'PPC Advertising',
  'Data Analytics', 'Mobile App Development', 'Software Testing',
  'DevOps Consulting', 'Training & Support',
];

const MAX_SERVICE_NAME_LENGTH = 120;
const normalizeServiceName = name => name.trim().replace(/\s+/g, ' ');
const serviceNameKey = name => normalizeServiceName(name).toLowerCase();

module.exports = { DEFAULT_SERVICE_NAMES, MAX_SERVICE_NAME_LENGTH, normalizeServiceName, serviceNameKey };

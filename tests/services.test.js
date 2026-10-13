const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const Service = require('../models/Service');
const User = require('../models/User');
const { DEFAULT_SERVICE_NAMES } = require('../utils/serviceNames');

test('service catalog API validates, persists and deduplicates names behind authentication', async t => {
  t.mock.method(jwt, 'verify', token => {
    if (token !== 'valid-session') throw Object.assign(new Error('Invalid token'), { name: 'JsonWebTokenError' });
    return { id: '507f1f77bcf86cd799439011' };
  });
  let active = true;
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: '507f1f77bcf86cd799439011', isActive: active }) }));
  const records = [];
  let failDatabase = false;
  let simulateRace = false;
  t.mock.method(Service, 'find', () => ({ select() { return this; }, sort() { return this; }, async lean() {
    if (failDatabase) throw new Error('Database unavailable');
    return [...records];
  } }));
  t.mock.method(Service, 'findOne', async ({ normalizedName }) => {
    if (failDatabase) throw new Error('Database unavailable');
    return records.find(record => record.normalizedName === normalizedName) || null;
  });
  t.mock.method(Service, 'create', async data => {
    const document = new Service(data);
    await document.validate();
    records.push(document.toObject());
    if (simulateRace) throw Object.assign(new Error('Duplicate key'), { code: 11000 });
    return document;
  });
  const app = express();
  app.use(express.json());
  app.use('/api/services', require('../routes/serviceRoutes'));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/services`;
  const request = async (method = 'GET', body, token = 'valid-session') => {
    const response = await fetch(url, { method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json',
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...await response.json() };
  };

  await t.test('unauthenticated, invalid and disabled sessions cannot access the catalog', async () => {
    for (const token of ['', 'invalid']) {
      assert.equal((await request('GET', undefined, token)).status, 401);
      assert.equal((await request('POST', { name: 'Unauthorized service' }, token)).status, 401);
    }
    active = false;
    assert.equal((await request('POST', { name: 'Unauthorized service' })).status, 403);
    active = true;
    assert.equal(records.length, 0);
  });
  await t.test('existing options from both forms are available without seeding the database', async () => {
    const response = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, DEFAULT_SERVICE_NAMES);
    assert.equal(records.length, 0);
  });
  await t.test('missing, whitespace, object and overlong names are rejected', async () => {
    for (const body of [undefined, {}, { name: 12 }, { name: {} }, { name: ['name'] }, { name: '\t  ' }, { name: 'x'.repeat(121) }]) {
      assert.equal((await request('POST', body)).status, 400);
    }
    assert.equal(records.length, 0);
  });
  await t.test('new names are normalized, saved with creator and returned by later list requests', async () => {
    const response = await request('POST', { name: '  Product   Photography  ', createdBy: 'ignored' });
    assert.equal(response.status, 201);
    assert.equal(response.created, true);
    assert.equal(response.data.name, 'Product Photography');
    assert.equal(records[0].createdBy.toString(), '507f1f77bcf86cd799439011');
    assert.ok((await request()).data.includes('Product Photography'));
  });
  await t.test('case and whitespace duplicates reuse the saved or default service', async () => {
    const response = await request('POST', { name: 'product   PHOTOGRAPHY' });
    assert.equal(response.status, 200);
    assert.equal(response.created, false);
    assert.equal(response.data.name, 'Product Photography');
    const defaultResponse = await request('POST', { name: 'web DEVELOPMENT' });
    assert.equal(defaultResponse.data.name, 'Web Development');
    assert.equal(records.length, 1);
  });
  await t.test('concurrent duplicate inserts return the service that won the race', async () => {
    simulateRace = true;
    const response = await request('POST', { name: 'Animation' });
    simulateRace = false;
    assert.equal(response.status, 200);
    assert.equal(response.data.name, 'Animation');
    assert.equal(response.created, false);
  });
  await t.test('database errors are reported and requests can be retried', async () => {
    failDatabase = true;
    assert.equal((await request()).status, 500);
    assert.equal((await request('POST', { name: 'Newsletter' })).status, 500);
    failDatabase = false;
    assert.equal((await request('POST', { name: 'Newsletter' })).status, 201);
  });
});

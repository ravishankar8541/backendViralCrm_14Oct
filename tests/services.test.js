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
  t.mock.method(Service, 'findOneAndUpdate', async (query, { $set: update }, options) => {
    if (failDatabase) throw new Error('Database unavailable');
    assert.deepEqual(options, { new: true, runValidators: true });
    const record = records.find(item => item._id.toString() === query._id && !query.normalizedName.$nin.includes(item.normalizedName));
    if (!record) return null;
    if (records.some(item => item !== record && item.normalizedName === update.normalizedName)) {
      throw Object.assign(new Error('Duplicate key'), { code: 11000 });
    }
    Object.assign(record, update);
    return record;
  });
  t.mock.method(Service, 'findOneAndDelete', async query => {
    if (failDatabase) throw new Error('Database unavailable');
    const index = records.findIndex(item => item._id.toString() === query._id && !query.normalizedName.$nin.includes(item.normalizedName));
    return index < 0 ? null : records.splice(index, 1)[0];
  });
  const app = express();
  app.use(express.json());
  app.use('/api/services', require('../routes/serviceRoutes'));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/services`;
  const request = async (method = 'GET', body, token = 'valid-session', path = '') => {
    const response = await fetch(`${url}${path}`, { method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json',
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...await response.json() };
  };

  await t.test('unauthenticated, invalid and disabled sessions cannot access the catalog', async () => {
    for (const token of ['', 'invalid']) {
      assert.equal((await request('GET', undefined, token)).status, 401);
      assert.equal((await request('POST', { name: 'Unauthorized service' }, token)).status, 401);
      assert.equal((await request('PATCH', { name: 'Unauthorized service' }, token, '/507f1f77bcf86cd799439012')).status, 401);
      assert.equal((await request('DELETE', undefined, token, '/507f1f77bcf86cd799439012')).status, 401);
    }
    active = false;
    assert.equal((await request('POST', { name: 'Unauthorized service' })).status, 403);
    assert.equal((await request('PATCH', { name: 'Unauthorized service' }, 'valid-session', '/507f1f77bcf86cd799439012')).status, 403);
    assert.equal((await request('DELETE', undefined, 'valid-session', '/507f1f77bcf86cd799439012')).status, 403);
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
  await t.test('custom services expose stable IDs; rename persists and rejects duplicates', async () => {
    const catalog = await request();
    const custom = catalog.customServices.find(service => service.name === 'Product Photography');
    assert.ok(custom.id);
    assert.equal(catalog.customServices.some(service => service.name === 'Web Development'), false);
    const path = `/${custom.id}`;
    for (const body of [{}, { name: [] }, { name: '   ' }, { name: 'x'.repeat(121) }]) {
      assert.equal((await request('PATCH', body, 'valid-session', path)).status, 400);
    }
    for (const name of ['web DEVELOPMENT', ' animation ']) {
      assert.equal((await request('PATCH', { name }, 'valid-session', path)).status, 409);
    }
    const response = await request('PATCH', { name: '  Studio   Photography  ' }, 'valid-session', path);
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { id: custom.id, name: 'Studio Photography' });
    const names = (await request()).data;
    assert.ok(names.includes('Studio Photography'));
    assert.equal(names.includes('Product Photography'), false);
    assert.equal((await request('PATCH', { name: 'STUDIO Photography' }, 'valid-session', path)).status, 200);
  });
  await t.test('invalid or missing IDs cannot mutate services', async () => {
    for (const method of ['PATCH', 'DELETE']) {
      const body = method === 'PATCH' ? { name: 'Changed' } : undefined;
      assert.equal((await request(method, body, 'valid-session', '/invalid')).status, 400);
      assert.equal((await request(method, body, 'valid-session', '/507f1f77bcf86cd799439099')).status, 404);
    }
  });
  await t.test('failed writes preserve names; confirmed deletion persists and permits recreating the name', async () => {
    const service = (await request()).customServices.find(item => item.name === 'STUDIO Photography');
    const path = `/${service.id}`;
    failDatabase = true;
    assert.equal((await request('PATCH', { name: 'Failed rename' }, 'valid-session', path)).status, 500);
    assert.equal((await request('DELETE', undefined, 'valid-session', path)).status, 500);
    failDatabase = false;
    assert.ok((await request()).data.includes(service.name));
    assert.equal((await request('DELETE', undefined, 'valid-session', path)).status, 200);
    assert.equal((await request()).data.includes(service.name), false);
    assert.equal((await request('DELETE', undefined, 'valid-session', path)).status, 404);
    assert.equal((await request('POST', { name: service.name })).status, 201);
  });
});

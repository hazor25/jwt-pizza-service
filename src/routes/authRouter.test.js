const request = require('supertest');
const app = require('../service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

beforeAll(async () => {
  testUser.email = `${randomName()}@test.com`;
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('register requires name email and password', async () => {
  const res = await request(app).post('/api/auth').send({
    name: 'missing fields',
    email: `${randomName()}@test.com`,
  });

  expect(res.status).toBe(400);
  expect(res.body.message).toBe('name, email, and password are required');
});

test('login unknown user fails', async () => {
  const res = await request(app).put('/api/auth').send({
    email: `${randomName()}@test.com`,
    password: 'wrong',
  });

  expect(res.status).toBe(404);
  expect(res.body.message).toBe('unknown user');
});

test('logout works for authenticated user', async () => {
  const res = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body.message).toBe('logout successful');
});

test('logout unauthorized without token', async () => {
  const res = await request(app).delete('/api/auth');

  expect(res.status).toBe(401);
  expect(res.body.message).toBe('unauthorized');
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}
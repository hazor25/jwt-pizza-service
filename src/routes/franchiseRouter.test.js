const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database');

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = {
    name: randomName(),
    email: `${randomName()}@admin.com`,
    password: 'toomanysecrets',
    roles: [{ role: Role.Admin }],
  };

  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

async function registerUser() {
  const user = {
    name: randomName(),
    email: `${randomName()}@test.com`,
    password: 'a',
  };

  const res = await request(app).post('/api/auth').send(user);
  return { user: res.body.user, token: res.body.token, password: user.password, email: user.email, name: user.name };
}

async function loginUser(user) {
  const res = await request(app).put('/api/auth').send({
    email: user.email,
    password: user.password,
  });
  return res.body.token;
}

describe('franchise routes', () => {
  let adminUser;
  let adminToken;
  let dinerUser;
  let dinerToken;

  beforeAll(async () => {
    adminUser = await createAdminUser();
    adminToken = await loginUser(adminUser);

    dinerUser = await registerUser();
    dinerToken = dinerUser.token;
  });

  test('get franchises', async () => {
    const res = await request(app).get('/api/franchise');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(Array.isArray(res.body.franchises)).toBe(true);
    expect(res.body).toHaveProperty('more');
  });

  test('non-admin cannot create franchise', async () => {
    const franchise = {
      name: randomName(),
      admins: [{ email: dinerUser.email }],
    };

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send(franchise);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to create a franchise');
  });

  test('admin can create franchise', async () => {
    const franchise = {
      name: randomName(),
      admins: [{ email: dinerUser.email }],
    };

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(franchise);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(franchise.name);
    expect(res.body).toHaveProperty('id');
    expect(res.body.admins[0].email).toBe(dinerUser.email);
    expect(res.body.admins[0]).toHaveProperty('id');
    expect(res.body.admins[0]).toHaveProperty('name');
  });

  test('user can get own franchises', async () => {
    const res = await request(app)
      .get(`/api/franchise/${dinerUser.user.id}`)
      .set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('user cannot get another users franchises', async () => {
    const res = await request(app)
      .get(`/api/franchise/${adminUser.id}`)
      .set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('admin can create store', async () => {
    const franchiseName = randomName();
    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: franchiseName,
        admins: [{ email: dinerUser.email }],
      });

    const franchiseId = franchiseRes.body.id;

    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: randomName() });

    expect(storeRes.status).toBe(200);
    expect(storeRes.body).toHaveProperty('id');
    expect(storeRes.body.franchiseId).toBe(franchiseId);
  });

  test('franchise admin can create store', async () => {
    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: randomName(),
        admins: [{ email: dinerUser.email }],
      });

    const franchiseId = franchiseRes.body.id;

    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({ name: randomName() });

    expect(storeRes.status).toBe(200);
    expect(storeRes.body.franchiseId).toBe(franchiseId);
  });

  test('unauthorized user cannot create store', async () => {
    const otherUser = await registerUser();

    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: randomName(),
        admins: [{ email: dinerUser.email }],
      });

    const franchiseId = franchiseRes.body.id;

    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${otherUser.token}`)
      .send({ name: randomName() });

    expect(storeRes.status).toBe(403);
    expect(storeRes.body.message).toBe('unable to create a store');
  });

  test('admin can delete store', async () => {
    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: randomName(),
        admins: [{ email: dinerUser.email }],
      });

    const franchiseId = franchiseRes.body.id;

    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: randomName() });

    const deleteRes = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe('store deleted');
  });

  test('admin can delete franchise', async () => {
    const franchiseRes = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
        name: randomName(),
        admins: [{ email: dinerUser.email }],
        });

    const franchiseId = franchiseRes.body.id;

    const deleteRes = await request(app)
        .delete(`/api/franchise/${franchiseId}`)
        .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe('franchise deleted');
    });
});
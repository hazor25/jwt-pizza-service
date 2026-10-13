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
  return {
    user: res.body.user,
    token: res.body.token,
    password: user.password,
    email: user.email,
    name: user.name,
  };
}

async function loginUser(user) {
  const res = await request(app).put('/api/auth').send({
    email: user.email,
    password: user.password,
  });
  return res.body.token;
}

describe('user routes', () => {
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

  test('get authenticated user requires auth', async () => {
    const res = await request(app).get('/api/user/me');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('unauthorized');
  });

  test('get authenticated user returns current user', async () => {
    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(dinerUser.user.id);
    expect(res.body.name).toBe(dinerUser.name);
    expect(res.body.email).toBe(dinerUser.email);
    expect(res.body.roles).toBeDefined();
  });

  test('user can update own account', async () => {
    const updatedName = randomName();
    const updatedEmail = `${randomName()}@test.com`;
    const updatedPassword = 'newpassword';

    const res = await request(app)
      .put(`/api/user/${dinerUser.user.id}`)
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({
        name: updatedName,
        email: updatedEmail,
        password: updatedPassword,
      });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(dinerUser.user.id);
    expect(res.body.user.name).toBe(updatedName);
    expect(res.body.user.email).toBe(updatedEmail);
    expect(res.body.user.roles).toBeDefined();
    expect(res.body.token).toBeDefined();

    dinerUser.name = updatedName;
    dinerUser.email = updatedEmail;
    dinerUser.password = updatedPassword;
    dinerToken = res.body.token;
  });

  test('user cannot update another user', async () => {
    const otherUser = await registerUser();

    const res = await request(app)
      .put(`/api/user/${otherUser.user.id}`)
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({
        name: randomName(),
        email: `${randomName()}@test.com`,
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unauthorized');
  });

  test('admin can update another user', async () => {
    const otherUser = await registerUser();
    const updatedName = randomName();
    const updatedEmail = `${randomName()}@test.com`;

    const res = await request(app)
      .put(`/api/user/${otherUser.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: updatedName,
        email: updatedEmail,
        password: 'updatedbyadmin',
      });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(otherUser.user.id);
    expect(res.body.user.name).toBe(updatedName);
    expect(res.body.user.email).toBe(updatedEmail);
    expect(res.body.token).toBeDefined();
  });

  test('update user requires auth', async () => {
    const res = await request(app)
      .put(`/api/user/${dinerUser.user.id}`)
      .send({
        name: randomName(),
        email: `${randomName()}@test.com`,
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('unauthorized');
  });

  test('delete user requires auth', async () => {
    const res = await request(app).delete(`/api/user/${dinerUser.user.id}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('unauthorized');
  });






  test('list users unauthorized', async () => {
    const res = await request(app).get('/api/user');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('unauthorized');
  });

  test('non-admin cannot list users', async () => {
    const res = await request(app)
        .get('/api/user')
        .set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unauthorized');
  });

  test('admin can list users', async () => {
    const res = await request(app)
        .get('/api/user')
        .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body).toHaveProperty('more');
  });


  test('admin list users returns user information', async () => {
    const res = await request(app)
      .get('/api/user?page=1&limit=200')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);

    // Find the first non-admin user (a "diner")
    const foundDiner = res.body.users.find((u) => 
      !u.roles?.some((r) => r.role === 'admin')
    );

    expect(foundDiner).toBeDefined();
    expect(foundDiner.name).toBeDefined();
    expect(foundDiner.email).toBeDefined();
    expect(foundDiner.roles).toBeDefined();
  });


  test('admin can delete a user', async () => {
    const otherUser = await registerUser();

    const res = await request(app)
        .delete(`/api/user/${otherUser.user.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('user deleted');
  });

  test('non-admin cannot delete a user', async () => {
    const res = await request(app)
        .delete(`/api/user/${dinerUser.user.id}`)
        .set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unauthorized');
  });
});
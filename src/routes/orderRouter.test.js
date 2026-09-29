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


describe('order routes', () => {
  let adminUser;
  let adminToken;
  let dinerUser;
  let dinerToken;
  let originalFetch;

  async function createFranchiseWithStore(adminToken, adminUser) {
    const franchiseName = randomName();
    const storeName = randomName();

    await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: franchiseName,
        admins: [{ email: adminUser.email }],
      });

    let franchisesRes = await request(app).get('/api/franchise');
    let franchise = franchisesRes.body.franchises.find(f => f.name === franchiseName);
    if (!franchise) {
      franchise = franchisesRes.body.franchises[0];
    }

    await request(app)
      .post(`/api/franchise/${franchise.id}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: storeName });

    franchisesRes = await request(app).get('/api/franchise');
    franchise = franchisesRes.body.franchises.find(f => f.name === franchiseName) || franchisesRes.body.franchises[0];

    return franchise;
  }

  beforeAll(async () => {
    adminUser = await createAdminUser();
    adminToken = await loginUser(adminUser);

    dinerUser = await registerUser();
    dinerToken = dinerUser.token;
  });

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    if (global.fetch && global.fetch.mockClear) {
      global.fetch.mockClear();
    }
  });

  afterAll(async () => {
    if (originalFetch) {
      global.fetch = originalFetch;
    }
    jest.restoreAllMocks();

    if (DB && typeof DB.close === 'function') {
      await DB.close();
    }
  });

  test('get menu', async () => {
    const res = await request(app).get('/api/order/menu');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('non-admin cannot add menu item', async () => {
    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({
        title: randomName(),
        description: 'test item',
        image: 'pizza.png',
        price: 0.01,
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to add menu item');
  });

  test('admin can add menu item', async () => {
    const title = randomName();

    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: 'test item',
        image: 'pizza.png',
        price: 0.01,
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((item) => item.title === title)).toBe(true);
  });

  test('authenticated user can get orders', async () => {
    const res = await request(app)
      .get('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dinerId).toBe(dinerUser.user.id);
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  test('authenticated user can create order', async () => {
    const menuRes = await request(app).get('/api/order/menu');
    const menuItem = menuRes.body[0];
    expect(menuItem).toBeTruthy();

    const franchise = await createFranchiseWithStore(adminToken, adminUser);
    expect(franchise).toBeTruthy();
    expect(franchise.stores.length).toBeGreaterThan(0);

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            reportUrl: 'http://factory.example/report',
            jwt: 'factory-jwt',
          }),
      })
    );

    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({
        franchiseId: franchise.id,
        storeId: franchise.stores[0].id,
        items: [
          {
            menuId: menuItem.id,
            description: menuItem.title,
            price: menuItem.price,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order');
    expect(res.body).toHaveProperty('jwt');
    expect(res.body).toHaveProperty('followLinkToEndChaos');
    expect(res.body.order).toHaveProperty('id');
  });

  test('factory failure returns 500', async () => {
    const menuRes = await request(app).get('/api/order/menu');
    const menuItem = menuRes.body[0];
    expect(menuItem).toBeTruthy();

    const franchise = await createFranchiseWithStore(adminToken, adminUser);
    expect(franchise).toBeTruthy();
    expect(franchise.stores.length).toBeGreaterThan(0);

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () =>
          Promise.resolve({
            reportUrl: 'http://factory.example/report',
          }),
      })
    );

    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({
        franchiseId: franchise.id,
        storeId: franchise.stores[0].id,
        items: [
          {
            menuId: menuItem.id,
            description: menuItem.title,
            price: menuItem.price,
          },
        ],
      });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to fulfill order at factory');
    expect(res.body).toHaveProperty('followLinkToEndChaos');
  });
});
// factories/orderFactory.js
const { faker } = require('@faker-js/faker');
const Order = require('../models/Order');

const createOrder = (customerId) => {
    return new Order({
        customerId,
        product: faker.commerce.productName(),
        amount: faker.number.int({ min: 1, max: 5000 }),
        createdAt: faker.date.past(),
    });
};

module.exports = createOrder;

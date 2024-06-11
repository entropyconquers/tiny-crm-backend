// factories/customerFactory.js
const { faker } = require('@faker-js/faker');
const Customer = require('../models/Customer');

const createCustomer = () => {
    return new Customer({
        name: faker.name.fullName(),
        email: faker.internet.email(),
        phone: faker.phone.number(),
        totalSpends: 0,
        visits: 0,
        lastVisit: 0,
    });
};

module.exports = createCustomer;

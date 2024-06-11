// scripts/generateTestData.js
const mongoose = require('mongoose');
const connectDB = require('../db');
const createCustomer = require('../factories/customerFactory');
const createOrder = require('../factories/orderFactory');

const Customer = require('../models/Customer');
const Order = require('../models/Order');

const generateTestData = async () => {
    await connectDB();
    
    await Customer.deleteMany({});
    await Order.deleteMany({});

    const customers = [];
    const orders = [];

    for (let i = 0; i < 5000; i++) {
        const customer = createCustomer();
        
        const numberOfOrders = Math.floor(Math.random() * 20) + 1; // Each customer can have 1 to 10 orders
        for (let j = 0; j < numberOfOrders; j++) {
            const order = createOrder(customer._id);
            orders.push(order);
            // Update customer totalSpends and visits
            customer.totalSpends += order.amount;
            customer.visits += 1;
            customer.lastVisit = order.createdAt;
        }
        customers.push(customer);
    }

    await Customer.insertMany(customers);
    await Order.insertMany(orders);

    console.log('Test data generated successfully');
    mongoose.connection.close();
};

generateTestData();

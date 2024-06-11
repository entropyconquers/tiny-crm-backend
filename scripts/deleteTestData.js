// scripts/deleteTestData.js
const mongoose = require('mongoose');
const connectDB = require('../db');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

const deleteTestData = async () => {
    await connectDB();

    try {
        await Customer.deleteMany({});
        console.log('All customers deleted');

        await Order.deleteMany({});
        console.log('All orders deleted');

    } catch (error) {
        console.error('Error deleting test data:', error);
    } finally {
        mongoose.connection.close();
    }
};

deleteTestData();

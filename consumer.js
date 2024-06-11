
require('dotenv').config();
const amqp = require('amqplib');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Customer = require('./models/Customer');
const Order = require('./models/Order');
const CommunicationLog = require('./models/CommunicationLog');

connectDB();

async function consumeMessages() {
    const amqpServer = process.env.AMQP_SERVER;
    const connection = await amqp.connect(amqpServer);
    const channel = await connection.createChannel();

    await channel.assertQueue("customer");
    await channel.assertQueue("order");
    await channel.assertQueue("communication");
    await channel.assertQueue("delivery-receipt");

    channel.consume("customer", async (msg) => {
        const customerData = JSON.parse(msg.content.toString());
        const customer = new Customer(customerData);
        await customer.save();
        channel.ack(msg);
    });

    channel.consume("order", async (msg) => {
        const orderData = JSON.parse(msg.content.toString());
        const order = new Order(orderData);
        await order.save();

        // Update customer totalSpends and visits
        const customer = await Customer.findById(orderData.customerId);
        console.log(customer);
        customer.totalSpends += orderData.amount;
        customer.visits += 1;
        customer.lastVisit = new Date();
        await customer.save();
        console.log(customer, 'updated');
        channel.ack(msg);
    });
    channel.prefetch(100); 
    channel.consume("communication", async (msg) => {
        const {
            customerId, message, campaignId
        } = JSON.parse(msg.content.toString());
        const log = new CommunicationLog({ customerId, message, campaignId: campaignId });
        await log.save();
        const deliveryStatus = Math.random() < 0.9 ? 'SENT' : 'FAILED';

        await channel.sendToQueue("delivery-receipt", Buffer.from(JSON.stringify({
            logId: log._id,
            status: deliveryStatus
        })));

        channel.ack(msg);
    });

    channel.consume("delivery-receipt", async (msg) => {
        const { logId, status } = JSON.parse(msg.content.toString());
        await CommunicationLog.findByIdAndUpdate(logId, { status });
        channel.ack(msg);
    });
}

consumeMessages();

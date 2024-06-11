const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Campaign = require('../models/Campaign');
const CommunicationLog = require('../models/CommunicationLog');
const amqp = require('amqplib');
const isLoggedIn = require('../middleware/auth');
const axios = require('axios');
const CampaignGroup = require('../models/CampaignGroup');

let channel, connection;

async function connectQueue() {
    const amqpServer = process.env.AMQP_SERVER || "amqp://guest:guest@localhost";
    connection = await amqp.connect(amqpServer);
    channel = await connection.createChannel();
    await channel.assertQueue("customer");
    await channel.assertQueue("order");
    await channel.assertQueue("communication");
    await channel.assertQueue("delivery-receipt");
}

connectQueue();

// Ingest customer data
router.post('/customer', async (req, res) => {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
        return res.status(400).send('Please provide name, email, and phone');
    }
    await channel.sendToQueue("customer", Buffer.from(JSON.stringify(req.body)));
    res.status(200).send('Customer data sent to queue');
});

// Get customer data 
router.get('/customer', async (req, res) => {
    const customers = await Customer.find({});
    res.status(200).json(customers);
});

// Ingest order data
router.post('/order', async (req, res) => {
    const { customerId, product, amount } = req.body;
    if (!customerId || !product || !amount) {
        return res.status(400).send('Please provide customerId, product, and amount');
    }
    await channel.sendToQueue("order", Buffer.from(JSON.stringify(req.body)));
    res.status(200).send('Order data sent to queue');
});

// Get order data 
router.get('/order', async (req, res) => {
    const orders = await Order.find({});
    res.status(200).json(orders);
});

// Create audience
router.post('/audience', isLoggedIn, async (req, res) => {
    const { rules } = req.body;
    let andConditions = [];
    let orConditions = [];
    
    rules.forEach(rule => {
        let mongoOperator;
        switch (rule.operator) {
            case '>': mongoOperator = '$gt'; break;
            case '<': mongoOperator = '$lt'; break;
            case '>=': mongoOperator = '$gte'; break;
            case '<=': mongoOperator = '$lte'; break;
            case '=': mongoOperator = '$eq'; break;
            case '!=': mongoOperator = '$ne'; break;
            default: throw new Error(`Unsupported operator ${rule.operator}`);
        }
    
        const condition = {
            [rule.field]: { [mongoOperator]: rule.field === 'lastVisit' ? new Date(rule.value) : rule.value }
        };
    
        if (rule.useType === 'AND') {
            andConditions.push(condition);
        } else if (rule.useType === 'OR') {
            orConditions.push(condition);
        }
    });
    
    let query = {};
    if (andConditions.length > 0) {
        query.$and = andConditions;
    }
    if (orConditions.length > 0) {
        query.$or = orConditions;
    }
    
    const customers = await Customer.find(query);
    const customerIds = customers.map(customer => customer._id);
    if (customerIds.length === 0) {
        return res.status(200).json({ count: 0 });
    }
    const campaignGroup = new CampaignGroup({ customerIds });
    await campaignGroup.save();

    res.status(200).json({ count: customerIds.length, campaignGroupId: campaignGroup._id });
});



// Create campaign
router.post('/campaign', isLoggedIn, async (req, res) => {
    const { name, campaignGroupId, message } = req.body;
    const campaignGroup = await CampaignGroup.findById(campaignGroupId);
    if (!campaignGroup) {
        return res.status(404).json({ error: 'CampaignGroup not found' });
    }

    const campaign = new Campaign({ name, campaignGroupId, message });
    await campaign.save();

    campaignGroup.customerIds.forEach(async customerId => {
        const log = new CommunicationLog({ customerId, message, campaignId: campaign._id });
        await log.save();
        await channel.sendToQueue("communication", Buffer.from(JSON.stringify(log)));
    });
    res.status(200).json(campaign);
});

//get campaigns 
//delivery stats like audience size, sent size, failed size in the campaign listing page
router.get('/campaign', async (req, res) => {
    const campaigns = await Campaign.find({}).sort({ createdAt: -1 });    
    const campaignData = await Promise.all(campaigns.map(async campaign => {
        const campaignGroup = await CampaignGroup.findById(campaign.campaignGroupId);
        // Check if campaignGroup exists
        if (!campaignGroup) {
            console.log(`CampaignGroup not found for campaignGroupId: ${campaign.campaignGroupId}`);
            return {
                ...campaign.toObject(),
                audienceSize: 0,
                sentSize: 0,
                failedSize: 0,

            };
        }
        
        const audienceSize = campaignGroup.customerIds.length;
        const failedSize = await CommunicationLog.countDocuments({ campaignId: campaign._id, status: 'FAILED' });
        const sentSize = await CommunicationLog.countDocuments({ campaignId: campaign._id, status: 'SENT' });
        return {
            ...campaign.toObject(),
            audienceSize,
            sentSize,
            failedSize
        };
    }));
    res.status(200).json(campaignData);
});

//delete all campaign groups
router.delete('/campaign-group', async (req, res) => {
    await CampaignGroup.deleteMany({});
    res.status(200).json({ message: 'All campaign groups deleted' });
});

//delete all campaigns
router.delete('/campaign', async (req, res) => {
    await Campaign.deleteMany({});
    res.status(200).json({ message: 'All campaigns deleted' });
});

// Print all communication logs with status and pagination
router.get('/communication-log', async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const logs = await CommunicationLog.find({}).limit(limit * 1).skip((page - 1) * limit);
    res.status(200).json(logs);
});

// filter communication logs by campaignId
router.get('/communication-log/:campaignId', async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const logs = await CommunicationLog
        .find({ campaignId: req.params.campaignId })
        .limit(limit * 1)
        .skip((page - 1) * limit);
    res.status(200).json(logs);
});


router.get("/user", isLoggedIn, (req, res) => {
    if (req.user && req.user.email) {
        res.status(200).json({ user: req.user });
    } else {
        res.status(401).json({ message: "You are not logged in" });
    }
});

module.exports = router;
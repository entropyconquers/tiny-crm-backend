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
    const communicationLogs = []
    campaignGroup.customerIds.forEach(async customerId => {
        const log = { customerId, message, campaignId: campaign._id };
        await channel.sendToQueue("communication", Buffer.from(JSON.stringify(log)));
    });
    res.status(200).json(campaign);
});

//get campaigns 
//delivery stats like audience size, sent size, failed size in the campaign listing page
router.get('/campaign', async (req, res) => {
    try {
        const campaigns = await Campaign.find({}).sort({ createdAt: -1 });
        const campaignGroupIds = [...new Set(campaigns.map(campaign => campaign.campaignGroupId))];
        
        const campaignGroups = await CampaignGroup.find({
            '_id': { $in: campaignGroupIds }
        }).lean(); 
        
        const campaignGroupMap = campaignGroups.reduce((acc, group) => {
            acc[group._id] = group;
            return acc;
        }, {});
        
        const communicationLogs = await CommunicationLog.aggregate([
            { $match: { campaignId: { $in: campaigns.map(campaign => campaign._id) }, status: { $in: ['FAILED', 'SENT'] } } },
            { $group: { _id: { campaignId: "$campaignId", status: "$status" }, count: { $sum: 1 } } }
        ]);
        
        const communicationLogMap = communicationLogs.reduce((acc, log) => {
            if (!acc[log._id.campaignId]) acc[log._id.campaignId] = { failedSize: 0, sentSize: 0 };
            if (log._id.status === 'FAILED') acc[log._id.campaignId].failedSize = log.count;
            if (log._id.status === 'SENT') acc[log._id.campaignId].sentSize = log.count;
            return acc;
        }, {});
        
        const campaignData = campaigns.map(campaign => {
            const campaignGroup = campaignGroupMap[campaign.campaignGroupId];
            const logs = communicationLogMap[campaign._id.toString()] || { failedSize: 0, sentSize: 0 };
            return {
                ...campaign.toObject(),
                audienceSize: campaignGroup ? campaignGroup.customerIds.length : 0,
                ...logs
            };
        });
        
        res.status(200).json(campaignData);
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        res.status(500).send('Internal Server Error');
    }
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


router.get("/authenticate", isLoggedIn, (req, res) => {
    // If the user is authenticated, return the json object with message "Authenticated"
    res.status(200).json({ message: "Authenticated" });
});

// Hello world test route
router.get("/ping", (req, res) => {
    res.status(200).json({ message: "pong" });
});

module.exports = router;
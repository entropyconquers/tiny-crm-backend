// models/Campaign.js
const mongoose = require('mongoose');
const CampaignGroup = require('./CampaignGroup');

const CampaignSchema = new mongoose.Schema({
    name: String,
    campaignGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignGroup' },
    createdAt: { type: Date, default: Date.now },
    message: String,
});

module.exports = mongoose.model('Campaign', CampaignSchema);

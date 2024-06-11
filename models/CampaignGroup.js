const mongoose = require('mongoose');

const campaignGroupSchema = new mongoose.Schema({
  customerIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  }]
});

const CampaignGroup = mongoose.model('CampaignGroup', campaignGroupSchema);

module.exports = CampaignGroup;
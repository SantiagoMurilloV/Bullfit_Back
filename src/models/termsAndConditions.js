const mongoose = require('mongoose');

const TermsAndConditionsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },    
    document: {
        type: String,
        required: true
    },
    agreement: {
        type: Boolean,
        default: false
    },
    link: {  
        type: String
    }

});

const TermsAndConditions = mongoose.model('TermsAndConditions', TermsAndConditionsSchema);

module.exports = TermsAndConditions;

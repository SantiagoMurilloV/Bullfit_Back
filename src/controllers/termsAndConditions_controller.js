const TermsAndConditions = require('../models/termsAndConditions');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const serviceAccount = require('../../bullfit-termsandconditions-firebase.json');
const { Storage } = require('@google-cloud/storage');


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const storage = new Storage({
    projectId: 'bullfit-termsandconditions',
    keyFilename: '../../bullfit-termsandconditions-firebase.json',
});


exports.createTermsAndConditions = async (req, res) => {
    try {
        const { userId, document, agreement } = req.body;

        const newTerms = new TermsAndConditions({
            userId,
            document,
            agreement
        });

        await newTerms.save();


        const browser = await puppeteer.launch();
        const page = await browser.newPage();


        await page.setContent(document);

        const pdfBuffer = await page.pdf({ format: 'A4' });
        await browser.close();

        const storage = admin.storage();
        const bucket = storage.bucket('gs://bullfit-termsandconditions.appspot.com');
        const file = bucket.file(`pdfs/${userId}.pdf`);

        const fileStream = file.createWriteStream({
            metadata: {
                contentType: 'application/pdf'
            }
        });

        fileStream.on('error', (err) => {
            console.error('Error al subir el PDF a Firebase Storage:', err);
            res.status(500).send('Error al subir el PDF a Firebase Storage');
        });

        fileStream.on('finish', () => {
            res.status(201).json({ message: 'PDF subido exitosamente' });
        });

        fileStream.end(pdfBuffer);
    } catch (error) {
        res.status(400).send(error.message);
    }
};
exports.getTermsAndConditions = async (req, res) => {
    try {
        const { userId } = req.params;

        const terms = await TermsAndConditions.findOne({ userId });

        if (!terms) {
            return res.status(404).send('Terms and Conditions not found for the given user.');
        }

        res.status(200).json(terms);
    } catch (error) {
        res.status(400).send(error.message);
    }
};


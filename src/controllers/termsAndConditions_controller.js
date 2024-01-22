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
        const fileName = `pdfs/${userId}termsConditions.pdf`;
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/bullfit-termsandconditions.appspot.com/o/${encodeURIComponent(fileName)}?alt=media`;

        const newTerms = new TermsAndConditions({
            userId,
            document,
            agreement,
            link: publicUrl 
        });

        await newTerms.save();

        res.status(201).json({ message: 'Enlace del PDF enviado', link: publicUrl });

        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        await page.setContent(document);

        const pdfBuffer = await page.pdf({ format: 'A4' });
        await browser.close();

        const storage = admin.storage();
        const bucket = storage.bucket('gs://bullfit-termsandconditions.appspot.com');
        const file = bucket.file(fileName);

        const fileStream = file.createWriteStream({
            metadata: {
                contentType: 'application/pdf'
            }
        });

        fileStream.on('error', (err) => {
            console.error('Error al subir el PDF a Firebase Storage:', err);
        });

        fileStream.on('finish', () => {
            console.log('PDF subido exitosamente');
        });

        fileStream.end(pdfBuffer);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(400).send(error.message);
    }
};

exports.getTermsAndConditionsAll = (req, res) => {
    TermsAndConditions.find()
      .then((users) => {
        res.json(users);
      })
      .catch((error) => {
        res.status(500).json({ error: 'Error al obtener la información de los usuarios' });
      });
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


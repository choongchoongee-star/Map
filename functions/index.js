const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors')({ origin: true });

admin.initializeApp();

exports.naverSearch = functions.https.onRequest((req, res) => {
    return cors(req, res, async () => {
        const query = req.query.query;
        if (!query) {
            return res.status(400).send('Query is required');
        }

        const NAVER_CLIENT_ID = 'B2TJjLUqHonjgR5c5jLE';
        const NAVER_CLIENT_SECRET = 'MNY2Z07eLf';

        try {
            const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
                params: {
                    query: query,
                    display: 10
                },
                headers: {
                    'X-Naver-Client-Id': NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
                }
            });

            res.status(200).json(response.data);
        } catch (error) {
            console.error('Naver API Error:', error);
            res.status(500).send('Error calling Naver API');
        }
    });
});

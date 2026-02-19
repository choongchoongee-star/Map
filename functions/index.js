const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require('axios');

exports.naverSearch = onRequest({ cors: true }, async (req, res) => {
    const query = req.query.query;
    if (!query) {
        res.status(400).send('Query is required');
        return;
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
        logger.error('Naver API Error:', error.message);
        res.status(500).send('Error calling Naver API');
    }
});

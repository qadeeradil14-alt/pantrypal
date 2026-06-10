const https = require('https');
const key = 'AIzaSyDzof6GeJDfP74kFXdxDkOJfFC220-Vhg4';
const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=lidl&key=${key}&types=establishment`;
https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'DATA:', data));
}).on('error', console.error);

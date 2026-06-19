const http = require('http');

http.get('http://localhost:3000/api/audio/12345', (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
}).on('error', (e) => {
  console.error(`Got error: ${e.message}`);
});

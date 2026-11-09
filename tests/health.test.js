const http = require('http');
const app = require('../src/app');

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`Running health test against port ${port}...`);

  http.get(`http://localhost:${port}/health`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      server.close();
      try {
        const json = JSON.parse(data);
        if (json.status === 'UP' && json.statusCode === 200) {
          console.log('✅ Health probe test passed successfully!');
          process.exit(0);
        } else {
          console.error('❌ Health probe test failed: Unexpected response', json);
          process.exit(1);
        }
      } catch (err) {
        console.error('❌ Health probe JSON parse error:', err);
        process.exit(1);
      }
    });
  }).on('error', (err) => {
    server.close();
    console.error('❌ Health probe connection error:', err);
    process.exit(1);
  });
});


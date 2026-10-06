const http = require('http');
const fs = require('fs');
const path = require('path');

let PORT = parseInt(process.env.PORT, 10) || 3000;
const DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  let filePath = path.join(DIR, reqPath);

  // Clean URLs support: e.g. /privacy -> /privacy.html
  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath += '.html';
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <body style="font-family:sans-serif;background:#151828;color:#BAC6B8;text-align:center;padding:50px;">
          <h1 style="color:#E9E4DC;">404 — Page Not Found</h1>
          <p>The requested file <code>${reqPath}</code> was not found.</p>
          <a href="/" style="color:#8BA794;">Back to Home</a>
        </body>
      `);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`\n========================================`);
    console.log(`  FOCUSSIVE Local Dev Server Active`);
    console.log(`  URL: http://localhost:${port}/`);
    console.log(`  Privacy: http://localhost:${port}/privacy`);
    console.log(`  Terms: http://localhost:${port}/terms`);
    console.log(`========================================\n`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is currently in use, trying port ${PORT + 1}...`);
    PORT += 1;
    setTimeout(() => {
      startServer(PORT);
    }, 200);
  } else {
    console.error('Server error:', err);
  }
});

startServer(PORT);

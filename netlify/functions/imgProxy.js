// /.netlify/functions/imgProxy
// Fetches a remote image and streams it back, stripping Referer and passing through content-type.
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  try {
    const url = (event.queryStringParameters && event.queryStringParameters.url) || '';
    if (!url) {
      return { statusCode: 400, body: 'Missing url param' };
    }
    const resp = await fetch(url, {
      // Do not forward any cookies or referer
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*',
        'Referer': '',
        'Origin': ''
      },
      redirect: 'follow'
    });
    if (!resp.ok) {
      return { statusCode: resp.status, body: `Upstream error ${resp.status}` };
    }
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const buffer = await resp.buffer();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        // Allow your front-end to use the image freely
        'Access-Control-Allow-Origin': '*'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return { statusCode: 500, body: 'Proxy error: ' + String(err) };
  }
};

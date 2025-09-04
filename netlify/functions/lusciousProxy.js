// netlify/functions/lusciousProxy.js
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const { id } = event.queryStringParameters || {};
    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing album id" })
      };
    }

    const q = {
      operationName: "PictureListInsideAlbum",
      variables: { album_id: String(id), page: 1, items_per_page: 50 },
      query: `query PictureListInsideAlbum($album_id: ID!, $page: Int!, $items_per_page: Int!) {
        picture {
          list(album_id: $album_id, page: $page, items_per_page: $items_per_page) {
            items {
              id
              url_to_original
              url_to_resized
              url_to_medium
            }
          }
        }
      }`
    };

    const res = await fetch("https://apicdn.luscious.net/graphql/nobatch/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(q)
    });

    const data = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

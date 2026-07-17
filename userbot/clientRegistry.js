let client = null;

function set(c) {
  client = c;
}

function get() {
  if (!client) throw new Error('Userbot client not ready yet.');
  return client;
}

module.exports = { set, get };

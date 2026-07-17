const exactHandlers = new Map();
const prefixHandlers = [];

function on(pattern, handler) {
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1);
    prefixHandlers.push({ prefix, handler });
    prefixHandlers.sort((a, b) => b.prefix.length - a.prefix.length);
  } else {
    exactHandlers.set(pattern, handler);
  }
}

async function dispatch(bot, query) {
  const data = query.data || '';
  if (exactHandlers.has(data)) {
    return exactHandlers.get(data)(bot, query, []);
  }
  for (const { prefix, handler } of prefixHandlers) {
    if (data.startsWith(prefix)) {
      const params = data.slice(prefix.length).split(':');
      return handler(bot, query, params);
    }
  }
  console.warn('Unhandled panel callback_data:', data);
  return null;
}

module.exports = { on, dispatch };

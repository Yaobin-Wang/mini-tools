import { randomBytes } from 'node:crypto';

export function createRestHandler(service, origin = 'http://127.0.0.1:4173') {
  const token = randomBytes(32).toString('hex');
  return async function restHandler(req, res) {
    const url = new URL(req.url, origin);
    if (!url.pathname.startsWith('/api/rest/')) return false;
    res.setHeader('Cache-Control', 'no-store');
    const reply = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      (req.headers['sec-fetch-site'] &&
        !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))
    ) {
      reply(403, { error: '来源验证失败' });
      return true;
    }
    if (
      req.method === 'GET' &&
      url.pathname === '/api/rest/session' &&
      req.headers['x-todo-client'] === 'rest-v1'
    ) {
      res.setHeader('Set-Cookie', `todo-rest=${token}; HttpOnly; SameSite=Strict; Path=/api/rest/`);
      reply(200, { token, state: service.snapshot() });
      return true;
    }
    const authenticated = (req.headers.cookie || '')
      .split(';')
      .some((c) => c.trim() === `todo-rest=${token}`);
    if (!authenticated) {
      reply(401, { error: '提醒服务会话已失效，请刷新页面' });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/rest/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.flushHeaders();
      const unsubscribe = service.subscribe((state) =>
        res.write(`data: ${JSON.stringify(state)}\n\n`),
      );
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
      res.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/rest/state') {
      reply(200, service.snapshot());
      return true;
    }
    if (req.method !== 'POST' || url.pathname !== '/api/rest/action') {
      reply(405, { error: '不支持的提醒接口' });
      return true;
    }
    if (
      req.headers.origin !== origin ||
      req.headers['x-todo-token'] !== token ||
      req.headers['content-type'] !== 'application/json'
    ) {
      reply(403, { error: '提醒操作验证失败' });
      return true;
    }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024) {
          reply(413, { error: '请求过大' });
          return true;
        }
      }
      const input = JSON.parse(body);
      reply(200, await service.action(input.action, input.minutes));
    } catch (e) {
      reply(400, { error: e.message || '提醒操作失败' });
    }
    return true;
  };
}

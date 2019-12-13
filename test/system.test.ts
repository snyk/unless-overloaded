import * as http from 'http';
import * as net from 'net';

import * as express from 'express';
import * as needle from 'needle';
import { Sema } from 'async-sema';

import { makeOverloadLimiter } from '../';

test('limit against locks', async () => {
  const app = express();
  const router = express.Router();

  const resourcesAvailable = 8;
  const maxConcurrentRequests = 4;

  const resource = new Sema(resourcesAvailable);

  const limiter = makeOverloadLimiter(maxConcurrentRequests);
  router.get('/unprotected', (req, res) => res.sendStatus(200));
  router.get('/free', limiter, (req, res) => res.sendStatus(200));
  router.get('/expensive', limiter, async (req, res) => {
    await resource.acquire();
    res.sendStatus(200);
  });

  app.use(router);

  const { base, stop } = await testExpress(app);

  try {
    // run a load of requests through the server, gumming up the works by consuming all of the `resource`.
    // these all succeed, but it should be possible for them to hit the rate limiter, depending on ordering?
    const notBlocked = await Promise.all(
      repeat(resourcesAvailable, async () =>
        getWithHeader(`${base}/expensive`),
      ),
    );
    for (const result of notBlocked) {
      expect(result.statusCode).toBe(200);
    }

    // run more requests through the server, all of which will gum up, and will trigger our limiting
    const blockages = Promise.all(
      repeat(maxConcurrentRequests, async () =>
        getWithHeader(`${base}/expensive`),
      ),
    );

    // now we will see limiting, but won't hang
    const limited = await Promise.all(
      repeat(100, async () => getWithHeader(`${base}/expensive`)),
    );
    for (const result of limited) {
      expect(result.statusCode).toBe(420);
    }

    // even though the limit is in effect on some endpoints, others are untouched
    // e.g. health-check
    expect((await getWithHeader(`${base}/unprotected`)).statusCode).toBe(200);

    // release one of the blocked requests
    resource.release();

    // as one of the blocked requests is free, we can request again
    // we can't request against something that needs a `resource`, as there aren't any
    expect((await getWithHeader(`${base}/free`)).statusCode).toBe(200);

    // release the remaining blocked requests
    for (let i = 0; i < resourcesAvailable + maxConcurrentRequests - 1; ++i) {
      resource.release();
    }

    // they should all succeed
    for (const result of await blockages) {
      expect(result.statusCode).toBe(200);
    }
  } finally {
    await stop();
  }
});

async function getWithHeader(url: string): Promise<needle.NeedleResponse> {
  return needle('get', url, { headers: { 'If-Not-Overloaded': '1' } });
}

async function testExpress(app: express.Express) {
  const hostname = '127.0.0.1';

  let server: http.Server;
  await new Promise((resolve) => (server = app.listen(0, hostname, resolve)));

  const addr = server!.address() as net.AddressInfo;
  const base = `http://${hostname}:${addr.port}`;

  return {
    base,
    stop: async () => await new Promise((resolve) => server!.close(resolve)),
  };
}

function repeat<T>(n: number, fn: () => Promise<T>): Promise<T>[] {
  return Array.from(Array(n)).map(fn);
}

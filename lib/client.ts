import { RequestPromiseOptions } from 'request-promise-native';
import { RequiredUriUrl } from 'request';
import * as requestPromiseNative from 'request-promise-native';
import { StatusCodeError } from 'request-promise-native/errors';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sleep = require('sleep-promise');

export type RequestArg = RequestPromiseOptions & RequiredUriUrl;

// @VisibleForTesting
export async function requestWorkerRunsWith(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: (req: RequestArg) => Promise<any>,
  req: RequestPromiseOptions & RequiredUriUrl,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  for (let triedBackends = 0; triedBackends < 10; ++triedBackends) {
    try {
      return await request({
        ...req,
        headers: { ...(req.headers || {}), 'If-Not-Overloaded': '1' },
      });
    } catch (e) {
      // if the service informs us it is overloaded...
      if (e instanceof StatusCodeError && 420 === e.statusCode) {
        // "immediately" try again, hitting a different worker in the pool

        // this is *not* a delay to wait for the service to become ready;
        // this is an attempt to slightly jitter our requests to avoid
        // weird "thundering herd" style problems

        // for 5 retries,
        // 10 * [0-4] * [0-1] is somewhere between 0 and 40ms
        // max total sleep is 0+1+2+3+4 = 100ms
        // event loop and sleep jitter (~10ms) is significantly higher than our sleep time
        await sleep(10 * triedBackends * Math.random());
        continue;
      }
      throw e;
    }
  }

  // give in, and just call whatever service is unlucky enough to be picked
  // it's probably already told us it's busy. Unlucky, service.
  return request(req);
}

/** RPC to a worker service, in a way that takes advantage of our pooling of worker services.
 *
 * The service needs to support this operation to get any benefit, but this function is written
 * such that it is still safe to use with any service.
 */
export async function requestWorkerRuns(
  req: RequestArg,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return requestWorkerRunsWith(requestPromiseNative, req);
}

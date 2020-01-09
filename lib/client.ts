import * as realNeedle from 'needle';
import {
  BodyData,
  NeedleHttpVerbs,
  NeedleOptions,
  NeedleResponse,
} from 'needle';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sleep = require('sleep-promise');

export type Needle = (
  method: NeedleHttpVerbs,
  url: string,
  data: BodyData,
  options?: NeedleOptions,
) => Promise<NeedleResponse>;

// @VisibleForTesting
export async function needleWorkerRunsWith(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  needle: Needle,
  method: NeedleHttpVerbs,
  url: string,
  data: BodyData,
  options?: NeedleOptions,
): Promise<NeedleResponse> {
  for (let triedBackends = 0; triedBackends < 10; ++triedBackends) {
    const response = await needle(method, url, data, {
      ...options,
      headers: { ...((options || {}).headers || {}), 'If-Not-Overloaded': '1' },
    });

    // for any status except our special "I'm overloaded!" status, immediately return.
    // also, any errors are just thrown directly
    if (420 !== response.statusCode) {
      return response;
    }

    // "immediately" try again, hitting a different worker in the pool

    // this is *not* a delay to wait for the service to become ready;
    // this is an attempt to slightly jitter our requests to avoid
    // weird "thundering herd" style problems

    // for 5 retries,
    // 10 * [0-4] * [0-1] is somewhere between 0 and 40ms
    // max total sleep is 0+1+2+3+4 = 100ms
    // event loop and sleep jitter (~10ms) is significantly higher than our sleep time
    await sleep(10 * triedBackends * Math.random());
  }

  // give in, and just call whatever service is unlucky enough to be picked
  // it's probably already told us it's busy. Unlucky, service.
  return needle(method, url, data, options);
}

/** RPC to a worker service, in a way that takes advantage of our pooling of worker services.
 *
 * The service needs to support this operation to get any benefit, but this function is written
 * such that it is still safe to use with any service.
 */
export async function needleWorkerRuns(
  method: NeedleHttpVerbs,
  url: string,
  data: BodyData,
  options?: NeedleOptions,
): Promise<NeedleResponse> {
  return needleWorkerRunsWith(realNeedle, method, url, data, options);
}

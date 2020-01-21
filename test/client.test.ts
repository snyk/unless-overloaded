import { Needle, needleWorkerRunsWith } from '../lib/client';
import {
  BodyData,
  NeedleHttpVerbs,
  NeedleOptions,
  NeedleResponse,
} from 'needle';

const limitHeader = { 'If-Not-Overloaded': '1' };

test('if the service does not support the protocol, the request is not re-sent', async () => {
  const expectedReq = ['get', 'http://potato', {}, { headers: limitHeader }];

  const seenReqs: any[] = [];
  const result = await needleWorkerRunsWith(
    mockNeedle(seenReqs, () => 200),
    'get',
    'http://potato',
    {},
  );

  expect(result.statusCode).toBe(200);
  expect(result.body).toBe(1);
  expect(seenReqs).toEqual([expectedReq]);
});

test('the service always rejects if it can', async () => {
  const mockReq = ['get', 'http://potato', {}, undefined];
  const expectedReq = ['get', 'http://potato', {}, { headers: limitHeader }];

  const seenReqs: any[] = [];
  const result = await needleWorkerRunsWith(
    mockNeedle(seenReqs, (options) => {
      if (((options || {}).headers || {})['If-Not-Overloaded'] === '1') {
        return 420;
      }
      return 200;
    }),
    'get',
    'http://potato',
    {},
  );

  // we tried a few times, at least
  expect(seenReqs.length).toBeGreaterThan(2);

  // we returned the result of the final call
  expect(result.body).toBe(seenReqs.length);

  // all of the requests except the last have the header
  for (let i = 0; i < seenReqs.length - 1; i++) {
    expect(seenReqs[i]).toEqual(expectedReq);
  }
  expect(seenReqs[seenReqs.length - 1]).toEqual(mockReq);
});

function mockNeedle(
  seenReqs: any[],
  handle: (options?: NeedleOptions) => number,
): Needle {
  return async (
    method: NeedleHttpVerbs,
    url: string,
    data: BodyData,
    options?: NeedleOptions,
  ): Promise<NeedleResponse> => {
    seenReqs.push([method, url, data, options]);
    return mockResponse(handle(options), seenReqs.length);
  };
}

function mockResponse(statusCode: number, body: any): NeedleResponse {
  return {
    body,
    statusCode,
  } as any;
}

import { requestWorkerRunsWith, RequestArg } from '../lib/client';
import { StatusCodeError } from 'request-promise-native/errors';

const limitHeader = { 'If-Not-Overloaded': '1' };

test('if the service does not support the protocol, the request is not re-sent', async () => {
  const mockReq = {
    url: 'http://potato',
  };
  const expectedReq = {
    ...mockReq,
    headers: limitHeader,
  };
  const seenReqs: RequestArg[] = [];
  const result = await requestWorkerRunsWith(async (req) => {
    seenReqs.push(req);
    return seenReqs.length;
  }, mockReq);

  expect(result).toBe(1);
  expect(seenReqs).toEqual([expectedReq]);
});

test('the service always rejects if it can', async () => {
  const mockReq = {
    url: 'http://potato',
  };
  const expectedReq = {
    ...mockReq,
    headers: limitHeader,
  };
  const seenReqs: RequestArg[] = [];
  const result = await requestWorkerRunsWith(async (req) => {
    seenReqs.push(req);
    if ((req.headers || {})['If-Not-Overloaded'] === '1') {
      throw new StatusCodeError(420, {}, req, undefined as any);
    }
    return seenReqs.length;
  }, mockReq);

  // we tried a few times, at least
  expect(seenReqs.length).toBeGreaterThan(2);

  // we returned the result of the final call
  expect(result).toBe(seenReqs.length);

  // all of the requests except the last have the header
  for (let i = 0; i < seenReqs.length - 1; i++) {
    expect(seenReqs[i]).toEqual(expectedReq);
  }
  expect(seenReqs[seenReqs.length - 1]).toEqual(mockReq);
});

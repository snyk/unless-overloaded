import { makeOverloadLimiter } from '../';
import { Request, Response } from 'express';

const limitHeader = { 'If-Not-Overloaded': '1' };

test('immediate completion never fails', async () => {
  const limiter = makeOverloadLimiter(4, {
    completionWatcher: (msg, cb) => cb(),
  });

  const next = jest.fn();
  for (let i = 0; i < 100; ++i) {
    limiter(mockRequest(limitHeader), mockResponse(), next);
  }

  expect(next).toHaveBeenCalledTimes(100);
});

test('delayed completion always fails', async () => {
  const limit = 4;
  const total = 100;

  const finishes = [];
  const limiter = makeOverloadLimiter(limit, {
    completionWatcher: (msg, cb) => finishes.push(cb),
  });

  const next = jest.fn();
  const responses = [];
  for (let i = 0; i < total; ++i) {
    const response = mockResponse();
    responses.push(response);
    limiter(mockRequest(limitHeader), response, next);
  }

  // 4 of our requests went on to the chain
  expect(finishes.length).toBe(limit);
  expect(next).toHaveBeenCalledTimes(limit);

  for (let i = 0; i < limit; ++i) {
    expect(responses[i].sendStatus).not.toBeCalled();
  }

  for (let i = limit; i < total; ++i) {
    expect(responses[i].sendStatus).toBeCalledWith(420);
  }
});

test('resolution unblocks us', async () => {
  const limit = 4;

  const finishes: Array<() => void> = [];
  const limiter = makeOverloadLimiter(limit, {
    completionWatcher: (msg, cb) => finishes.push(cb),
  });

  const next = jest.fn();
  for (let i = 0; i < limit; ++i) {
    limiter(mockRequest(limitHeader), mockResponse(), next);
  }

  // 4 of our requests went on to the chain
  expect(finishes.length).toBe(limit);
  expect(next).toHaveBeenCalledTimes(limit);

  {
    const res = mockResponse();
    limiter(mockRequest(limitHeader), res, next);
    expect(res.sendStatus).toBeCalledWith(420);
  }

  // release a request
  finishes.pop()!();

  // we can now run more requests
  limiter(mockRequest(limitHeader), mockResponse(), next);
  expect(next).toHaveBeenCalledTimes(limit + 1);
});

function mockRequest(headers: { [key: string]: string }): Request {
  return {
    header: (key: string) => headers[key],
  } as any;
}

function mockResponse(): Response {
  const res = {} as any;
  res.sendStatus = jest.fn().mockReturnValue(res);
  return res;
}

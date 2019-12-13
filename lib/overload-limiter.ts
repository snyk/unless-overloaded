import { OutgoingMessage } from 'http';

import { Request, RequestHandler, Response } from 'express';
import * as prom from 'prom-client';

// eslint-disable-next-line @typescript-eslint/no-require-imports
import onFinished = require('on-finished');

const countOfOverloads = new prom.Counter({
  name: 'overload_reject_count',
  help: 'count of requests rejected due to overload',
  labelNames: ['endpoint'],
});

const inFlightRequestGauge = new prom.Gauge({
  name: 'overload_in_flight_requests',
  help: 'count of requests in flight right now',
  labelNames: ['endpoint'],
});

export type CompletionWatcher = <T extends OutgoingMessage>(
  msg: T,
  listener: () => void,
) => void;

export interface Options {
  headerName: string;
  promEndpoint: string;
  completionWatcher: CompletionWatcher;
}

export function makeOverloadLimiter(
  maxConcurrentRequests: number,
  opts?: Partial<Options>,
): RequestHandler {
  let inFlightRequests = 0;

  const options: Options = {
    headerName: 'If-Not-Overloaded',
    promEndpoint: 'main',
    completionWatcher: onFinished,
    ...(opts || {}),
  };

  const labels = { endpoint: options.promEndpoint };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: Request, res: Response, next: () => void): any => {
    if (
      req.header(options.headerName) &&
      inFlightRequests >= maxConcurrentRequests
    ) {
      countOfOverloads.inc(labels);
      return res.sendStatus(420);
    }

    inFlightRequests += 1;
    inFlightRequestGauge.set(labels, inFlightRequests);

    options.completionWatcher(res, () => {
      inFlightRequests -= 1;
      inFlightRequestGauge.set(labels, inFlightRequests);
    });

    return next();
  };
}

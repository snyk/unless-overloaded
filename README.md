# unless-overloaded

Middleware to reject requests if we have too many requests in-flight already.

The client must *opt-in* to this behaviour by sending us a `If-Not-Overloaded: 1` header.

We expect clients to eventually give up and just retry *without* the header, skipping the limiting.
This implies your application should have other concurrency limiting or queuing in place, if
appropriate. This might just be the node event loop.

There's a wrapper for `needle` available in `needleWorkerRuns`. This
will attempt to locate a worker which isn't overloaded, and send the request to it.
If the worker doesn't support this protocol, or a free worker cannot be found,
then the request will be run anyway; the same as if `needle` was used directly.


## Example

```typescript
import { makeOverloadLimiter } from 'unless-overloaded';
const unlessOverloaded = makeOverloadLimiter(config.maxConcurrentRequests);
router.get('/unprotected', handleUnprotected);
router.get('/expensive', unlessOverloaded, handleProtected);
```


## Why??

This allows a client which retries to pick an idle backend behind a dumb,
uncooperative load-balancer, such as a Kubernetes `Service`.

The `Service` always operates in round-robin mode. If the pod that it "picks"
is overloaded, we can inform cooperative clients that they might want to try
again, and hopefully end up being served by a different `Pod`, which isn't
overloaded. If they retry for long enough, they may even hit a newly scheduled
`Pod` in the `HPA`.

This is an interim step between what we have now (forkbombs) and actual decoupling.


## Design pattern?

We're undecided if this is:
 * a service mesh-style "fail closed" circuit-breaker (??), c.f. https://istio.io/docs/concepts/traffic-management/#circuit-breakers
 * what readiness in kubernetes is supposed to be, without the alerting on failure
    (again, only because we're expecting the client to fail-closed)
 * a work-stealing queue, but entirely upside down? A work-sliding queue.
    The insertion work is done by the client's probing loop; it's trying to
    probe for a free queue slot in various workers' queues. If it fails, it can just
    push it on to a random worker's queue. It's not quite work stealing because once
    it's actually inserted, it's stuck forever. Some work-stealing impls do this anyway.


Managing Consumer Request Quotas with NGINX Plus [Proof of Concept]
===================================================================

Before You Start (things you need)
----------------------------------
1. Docker runtime and docker compose
2. Pre-built NGINX Plus Docker image (`nginx-plus:latest`) that includes the JavaScript module

PoC Environment
---------------
This is a logical diagram of the illustrated scenario. In reality, all Docker containers
share a single, flat network. But this is how to visualize it.

```
                                       +------------------+
                                   +---| frontend_proxy_1 |---+
                                   |   +------------------+   |
                                   |                          |
+--------+     +---------------+   |   +------------------+   |   +---------------+
| Client |-----| load_balancer |---+---| frontend_proxy_2 |---+---|  backend_app  |
+--------+     +---------------+   |   +------------------+   |   +---------------+
                                   |                          |
                                   |   +------------------+   |
                                   +---| frontend_proxy_3 |---+
                                       +------------------+
```

Getting Started
---------------
Start the environment with `docker up -d`
Use `docker ps` to check the port mappings.

Initialize the request quota for a given Consumer by POSTing into the key value store on any of the frontend proxies:
```
curl -id '{"foo":5}' localhost:20003/api/6/http/keyvals/quotas
```

Check the current quota levels by querying the key value store
```
curl -s localhost:20000/api/6/http/keyvals
```

Make a request for the backend app through the load balancer
```
curl -iH "Consumer: foo" localhost
```

Do a few more until you run out of requests.

How it works
------------
* The frontend proxies share a key value store with the current quota for each consumer.
* The load balancer sprays requests randomly across the frontend proxies.
* Each frontend proxy checks for a Consumer request header.
  - No header returns `401`
  - The key value store is searched for a matching Consumer header to find the remaining quota
  - The request is proxied if remaining quota is greater than or equal to zero. Else `429`.
* In parallel to the proxied request, a separate subrequest is sent to the decrement service
  - The decrement service is hosted on ONE of the frontend proxies (default is `_1`)
  - The decrement service reduces the remaining quota for this Consumer by one
  - The key value store is protected against race conditions by only allowing one decrement
    operation at a time
* Failure to decrement does not affect the availability of the backend app
* If overwhelmed by more than one million concurrent requests, the decrement service refuses additional requests
* Because the decrement operation is asynchronous to the proxying of the client's request,
  it is possible for a Consumer to over-use their allocated quota by a small amount. This can
  be seen by a negative number in the remaining quota.

Other Notes
-----------
- The async nature of the quota decrement service optimizes latency in exchange for accuracy.
- We assume decrement success and tolerate a small amount of overuse.
- In reality, a high frequency Consumer gets 1-2 additional seconds once quota is exhausted - this is a function of the zone_sync interval.
- Benchmark testing with tools like `ab` or `wrk` will clearly show this behaviour.
- Failure of the frontend proxy operating the decrement service can be recovered by modifying the decrement_svc upstream group. In the meantime, client requests are successful.
- At high loads, the decrement service adds latency to the requests proxied through it - an
alternative is to deploy a dedicated decrement service. But consider ease of failover.

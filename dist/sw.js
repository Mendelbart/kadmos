const putInCache = async (request, response) => {
    const cache = await caches.open("v2");
    await cache.put(request, response);
};

const cacheLast = async (request) => {
    try {
        const responseFromNetwork = await fetch(request);

        putInCache(request, responseFromNetwork.clone());
        return responseFromNetwork;
    } catch (error) {
        console.warn("Network error, gonna try to grab from cache.");
        console.error(error);
    }

    const responseFromCache = await caches.match(request);
    if (responseFromCache) return responseFromCache;

    return new Response("No network or cached data.", {
        status: 408,
        headers: { "Content-Type": "text/plain" },
    })
};

self.addEventListener("fetch", (event) => {
    event.respondWith(
        cacheLast(event.request),
    );
});
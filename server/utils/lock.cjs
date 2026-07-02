// Simple Async Mutex to prevent race conditions on JSON files
class AsyncLock {
    constructor() {
        this.promise = Promise.resolve();
    }
    async acquire() {
        let release;
        const next = new Promise(resolve => { release = resolve; });
        const current = this.promise;
        this.promise = current.then(() => next, () => next);
        await current;
        return release;
    }
}

module.exports = AsyncLock;

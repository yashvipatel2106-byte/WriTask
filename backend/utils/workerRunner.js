const { Worker } = require("worker_threads");
const path = require("path");

function runWorker(workerFile, data) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            path.join(__dirname, "..", "workers", workerFile),
            {
                workerData: data,
            }
        );

        worker.on("message", (message) => {
            resolve(message);
        });

        worker.on("error", (error) => {
            reject(error);
        });

        worker.on("exit", (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

module.exports = runWorker;
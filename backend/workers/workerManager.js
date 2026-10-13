const { Worker } = require("worker_threads");
const path = require("path");

class WorkerManager {
  run(workerName, data) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        path.join(__dirname, workerName),
        {
          workerData: data,
        }
      );

      worker.once("message", (result) => {
        resolve(result);
      });

      worker.once("error", (error) => {
        reject(error);
      });

      worker.once("exit", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `Worker exited with code ${code}`
            )
          );
        }
      });
    });
  }
}

module.exports = new WorkerManager();
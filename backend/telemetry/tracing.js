const { NodeSDK } = require("@opentelemetry/sdk-node");

const {
    getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");

const sdk = new NodeSDK({

    serviceName: "writask-backend",

    instrumentations: [

        getNodeAutoInstrumentations({

            "@opentelemetry/instrumentation-fs": {
                enabled: false,
            },

        }),

    ],

});

sdk.start();

console.log("✅ OpenTelemetry Initialized");
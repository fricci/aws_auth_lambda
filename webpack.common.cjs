const path = require("path");
const FileManagerPlugin = require("filemanager-webpack-plugin");

module.exports = {
  entry: "./src/api-gateway-authorizer.ts",
  externals: {},
  target: "node16",
  resolve: {
    extensions: [".ts", ".js"],

  },
  experiments: {
    outputModule: true,
  },
  output: {
    filename: "index.mjs",
    path: path.resolve(__dirname, "dist"),
    library: {
      type: "module",
    },
  },
  plugins: [
    new FileManagerPlugin({
      events: {
        onStart: {
          delete: ["dist"],
        },
        onEnd: {
          delete: ["lambda"],
          mkdir: ["lambda"],
          archive: [{ source: "dist", destination: "lambda/bundle.zip" }],
        },
      },
    }),
  ],
};

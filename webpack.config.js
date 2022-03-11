const path = require("path");
module.exports = (env) => ({
  cache:false,
  entry: "./index.ts",
  mode: env.target,
  target: "node",
  output: {
    path: path.resolve(__dirname),
    filename: "index.js",
    devtoolModuleFilenameTemplate: "[absolute-resource-path]",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [{ test: /\.tsx?$/, loader: "ts-loader", options: { allowTsInNodeModules: true }}],
  },
});

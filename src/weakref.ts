import * as weak from "./weakref-generic";

const nodeMajorVersion = parseInt(process.versions.node.replace(/\..*/, ""));

export default nodeMajorVersion >= 12
  ? weak // https://github.com/node-ffi-napi/weak-napi/issues/16
  : require("weak-napi");

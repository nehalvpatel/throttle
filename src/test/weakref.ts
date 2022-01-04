import assert from "assert";
import * as weakrefFunc from "../weakref-generic";

describe("weakref", () => {
  let weak: any;

  before(() => {
    weak = weakrefFunc;
  });

  it("should create a weak ref", () => {
    const a = { test: "yes" };

    const ref = weak.makeWeakRef(a);

    assert(ref);

    assert.strictEqual(weak.getRealRef(ref), a);
  });

  it("should create a weak ref", () => {
    const a = { test: "yes" };

    const ref = weak.makeWeakRef(a);

    assert(ref);

    assert.strictEqual(weak.getRealRef(ref), a);
  });

  it("should detect refs that are not dead yet", () => {
    const a = { test: "yes" };
    const ref = weak.makeWeakRef(a);

    assert(!weak.isRealRefDead(ref), "weakref is dead");
  });

  it("should detect when refs become dead", function (done) {
    if (weak.isUnsupported) return this.skip();

    this.timeout(30000);

    const ref = (function () {
      const a = { test: "yes" };
      return weak.makeWeakRef(a);
    })();

    function isDeadYet() {
      if (weak.isRealRefDead(ref)) return done();

      setTimeout(isDeadYet, 250);
    }

    isDeadYet();
  });
});

import { describe, expect, it } from "vitest";
import { suggestLoginEmail } from "./email-suggest";

describe("suggestLoginEmail", () => {
  it("suggests the domain as soon as the @ is typed", () => {
    expect(suggestLoginEmail("leon@")).toBe("leon@optimumtrain.page");
  });

  it("completes a partially typed domain (case-insensitive)", () => {
    expect(suggestLoginEmail("leon@opti")).toBe("leon@optimumtrain.page");
    expect(suggestLoginEmail("leon@OPTIMUMTRAIN.PA")).toBe("leon@optimumtrain.page");
  });

  it("keeps the typed local part verbatim", () => {
    expect(suggestLoginEmail("Leon.Lai+x@o")).toBe("Leon.Lai+x@optimumtrain.page");
  });

  it("is silent before the @ or with an empty local part", () => {
    expect(suggestLoginEmail("")).toBeNull();
    expect(suggestLoginEmail("leon")).toBeNull();
    expect(suggestLoginEmail("@optimum")).toBeNull();
  });

  it("is silent once the address is complete", () => {
    expect(suggestLoginEmail("leon@optimumtrain.page")).toBeNull();
  });

  it("is silent when the typed domain diverges from the staff domain", () => {
    expect(suggestLoginEmail("leon@gmail.com")).toBeNull();
    expect(suggestLoginEmail("leon@optimumx")).toBeNull();
  });

  it("is silent on malformed input (spaces, double @)", () => {
    expect(suggestLoginEmail("le on@opti")).toBeNull();
    expect(suggestLoginEmail("leon@opti@")).toBeNull();
  });

  it("trims surrounding whitespace before judging", () => {
    expect(suggestLoginEmail("  leon@opti  ")).toBe("leon@optimumtrain.page");
  });
});

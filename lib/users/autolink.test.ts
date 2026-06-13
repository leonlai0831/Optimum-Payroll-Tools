import { describe, expect, it } from "vitest";
import { deterministicLinks } from "./autolink";

describe("deterministicLinks", () => {
  it("links a user to the single coach with the same cleaned name", () => {
    const links = deterministicLinks(
      [{ id: 1, name: "Darren Lee" }],
      [
        { id: 10, name: "DARREN LEE [BK]" },
        { id: 11, name: "EVI CHOW" },
      ],
    );
    expect(links).toEqual([{ userId: 1, coachId: 10 }]);
  });

  it("skips ambiguous names (two coaches share a cleaned name)", () => {
    const links = deterministicLinks(
      [{ id: 1, name: "CK" }],
      [
        { id: 10, name: "CK [BK]" },
        { id: 11, name: "CK [PK]" },
      ],
    );
    expect(links).toEqual([]);
  });

  it("gives a coach to at most one user", () => {
    const links = deterministicLinks(
      [
        { id: 1, name: "Darren Lee" },
        { id: 2, name: "darren  lee" },
      ],
      [{ id: 10, name: "Darren Lee" }],
    );
    expect(links).toEqual([{ userId: 1, coachId: 10 }]);
  });

  it("skips users with no matching coach and blank names", () => {
    const links = deterministicLinks(
      [
        { id: 1, name: "Nobody Here" },
        { id: 2, name: "" },
      ],
      [{ id: 10, name: "Darren Lee" }],
    );
    expect(links).toEqual([]);
  });
});

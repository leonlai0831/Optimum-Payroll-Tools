import { describe, expect, it } from "vitest";
import { deterministicLinks, sharesNameSignal, type LinkUser } from "./autolink";

const u = (over: Partial<LinkUser> & { id: number }): LinkUser => ({
  displayName: "",
  fullName: "",
  email: "x@y.com",
  ...over,
});

describe("deterministicLinks", () => {
  it("links a user to the single coach with the same cleaned name", () => {
    const links = deterministicLinks(
      [u({ id: 1, displayName: "Darren Lee" })],
      [
        { id: 10, name: "DARREN LEE [BK]" },
        { id: 11, name: "EVI CHOW" },
      ],
    );
    expect(links).toEqual([{ userId: 1, coachId: 10 }]);
  });

  it("prefers the FULL NAME over the nickname", () => {
    // Nickname is a short handle; the full name is what matches the coach.
    const links = deterministicLinks(
      [u({ id: 1, displayName: "Tary", fullName: "YAP CHEE HAU" })],
      [
        { id: 10, name: "YAP CHEE HAU" },
        { id: 11, name: "TUNKU AFIQAH" },
      ],
    );
    expect(links).toEqual([{ userId: 1, coachId: 10 }]);
  });

  it("matches a reversed token order (same token set)", () => {
    const links = deterministicLinks(
      [u({ id: 1, fullName: "Lee Darren" })],
      [{ id: 10, name: "Darren Lee" }],
    );
    expect(links).toEqual([{ userId: 1, coachId: 10 }]);
  });

  it("matches a multi-token subset (full name contains the coach name)", () => {
    const links = deterministicLinks(
      [u({ id: 1, fullName: "LIM CAI NI" })],
      [{ id: 10, name: "CAI NI" }],
    );
    expect(links).toEqual([{ userId: 1, coachId: 10 }]);
  });

  it("does NOT let a single-token name grab one of many similar coaches", () => {
    const links = deterministicLinks(
      [u({ id: 1, displayName: "Anwar" })],
      [
        { id: 10, name: "MUHAMMAD ANWAR FADHIL" },
        { id: 11, name: "MUHAMMAD ANWAR HAKIMI" },
      ],
    );
    expect(links).toEqual([]);
  });

  it("skips an ambiguous full-name subset (two coaches qualify)", () => {
    const links = deterministicLinks(
      [u({ id: 1, fullName: "MUHAMMAD ANWAR" })],
      [
        { id: 10, name: "MUHAMMAD ANWAR FADHIL" },
        { id: 11, name: "MUHAMMAD ANWAR HAKIMI" },
      ],
    );
    expect(links).toEqual([]);
  });

  it("skips ambiguous exact names (two coaches share a cleaned name)", () => {
    const links = deterministicLinks(
      [u({ id: 1, displayName: "CK" })],
      [
        { id: 10, name: "CK [BK]" },
        { id: 11, name: "CK [PK]" },
      ],
    );
    expect(links).toEqual([]);
  });

  it("gives a coach to at most one user (strongest tier wins)", () => {
    const links = deterministicLinks(
      [
        u({ id: 1, fullName: "DARREN LEE TAN" }), // subset (tier 1)
        u({ id: 2, displayName: "Darren Lee" }), // exact (tier 3) — should win the coach
      ],
      [{ id: 10, name: "Darren Lee" }],
    );
    expect(links).toEqual([{ userId: 2, coachId: 10 }]);
  });

  it("skips users with no matching coach and blank names", () => {
    const links = deterministicLinks(
      [u({ id: 1, displayName: "Nobody Here" }), u({ id: 2 })],
      [{ id: 10, name: "Darren Lee" }],
    );
    expect(links).toEqual([]);
  });
});

describe("sharesNameSignal", () => {
  it("accepts a coach sharing a full-name token", () => {
    expect(sharesNameSignal(u({ id: 1, fullName: "YAP CHEE HAU" }), "YAP CHEE HAU")).toBe(true);
  });

  it("accepts a coach token found in the nickname", () => {
    expect(sharesNameSignal(u({ id: 1, displayName: "Darren" }), "DARREN LEE")).toBe(true);
  });

  it("rejects a signal-less account (phone-number email, generic nickname)", () => {
    expect(
      sharesNameSignal(
        u({ id: 1, displayName: "Tary", fullName: "", email: "0163653658z@gmail.com" }),
        "TUNKU AFIQAH",
      ),
    ).toBe(false);
  });

  it("rejects when no token overlaps at all", () => {
    expect(
      sharesNameSignal(
        u({ id: 1, displayName: "Joshua Khoo", email: "mustbelike@gmail.com" }),
        "WONG ZHAO YEE",
      ),
    ).toBe(false);
  });

  it("ignores very short tokens", () => {
    expect(sharesNameSignal(u({ id: 1, fullName: "AB" }), "AB CDE")).toBe(false);
  });
});

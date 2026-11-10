import { beforeEach, expect, it } from "vitest";
import { loadLook, saveLook } from "@/lib/look";
import { mirrorAuthUser } from "@/lib/authSession";
import { getUser, resetUser } from "@/lib/user";
import type { ApiUser } from "@/api/types";

beforeEach(() => {
  localStorage.clear();
  resetUser();
});

it("remembers the colour and photo per account, ignoring email case", () => {
  expect(saveLook("Ann@x.com", { avatar: 3 })).toBe(true);
  expect(saveLook("ann@x.com", { avatarImage: "data:image/jpeg;base64,AA" })).toBe(true);
  expect(loadLook("ANN@x.com")).toEqual({ avatar: 3, avatarImage: "data:image/jpeg;base64,AA" });
  expect(loadLook("bob@x.com")).toEqual({});
  saveLook("ann@x.com", { avatarImage: undefined });
  expect(loadLook("ann@x.com")).toEqual({ avatar: 3 });
});

it("signing in again (after a sign-out wiped the store) brings the colour and photo back", () => {
  saveLook("ann@x.com", { avatar: 2, avatarImage: "data:image/jpeg;base64,BB" });
  mirrorAuthUser({ id: "u1", email: "ann@x.com", fullName: "Ann", role: "user", preferences: null } as unknown as ApiUser);
  expect(getUser().profile.avatar).toBe(2);
  expect(getUser().profile.avatarImage).toBe("data:image/jpeg;base64,BB");
});

it("the colour and photo stored on the account win, so they are the same on every device", () => {
  saveLook("ann@x.com", { avatar: 1, avatarImage: "data:image/jpeg;base64,OLD" });
  mirrorAuthUser({ id: "u1", email: "ann@x.com", fullName: "Ann", role: "user", accentColor: 4, avatarUrl: "data:image/jpeg;base64,NEW", preferences: null } as unknown as ApiUser);
  expect(getUser().profile.avatar).toBe(4);
  expect(getUser().profile.avatarImage).toBe("data:image/jpeg;base64,NEW");
  expect(loadLook("ann@x.com")).toEqual({ avatar: 4, avatarImage: "data:image/jpeg;base64,NEW" });
});

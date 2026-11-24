import { describe, expect, it } from "vitest";
import { captureRoute, shareTargetRoute } from "./capture";

describe("capture", () => {
  it("turns a LinkedIn share into the new-contact form", () => {
    const route = shareTargetRoute("/share-target", "?text=" + encodeURIComponent("Check out Jane Doe’s profile on LinkedIn https://www.linkedin.com/in/jane-doe"));
    const q = new URLSearchParams(route!.split("?")[1]);
    expect(route!.startsWith("/new?")).toBe(true);
    expect(q.get("name")).toBe("Jane Doe");
  });

  it("fills the email or phone when that is what was shared", () => {
    expect(new URLSearchParams(captureRoute({ text: "ana@example.org" }).split("?")[1]).get("email")).toBe("ana@example.org");
    expect(new URLSearchParams(captureRoute({ text: "+32 475 12 34 56" }).split("?")[1]).get("phone")).toBe("+32 475 12 34 56");
  });

  it("ignores a sign-in return to the root", () => {
    expect(shareTargetRoute("/", "?code=1&state=2")).toBeNull();
  });
});

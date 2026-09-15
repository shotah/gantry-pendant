import { describe, expect, it } from "vitest";
import { readDevicePermission, blockedHint } from "@/lib/phone/permit";

describe("device permission", () => {
  it("keeps the three PermissionStatus names and treats junk as unsupported", () => {
    expect(readDevicePermission("granted")).toBe("granted");
    expect(readDevicePermission("denied")).toBe("denied");
    expect(readDevicePermission("prompt")).toBe("prompt");
    expect(readDevicePermission("nope")).toBe("unsupported");
    expect(readDevicePermission(undefined)).toBe("unsupported");
  });

  it("names blocked vs missing, and is quiet when we can still ask", () => {
    expect(blockedHint("denied")).toBe("Blocked — enable in system settings.");
    expect(blockedHint("unsupported")).toBe("Not available in this browser.");
    expect(blockedHint("prompt")).toBe("");
    expect(blockedHint("granted")).toBe("");
  });
});
